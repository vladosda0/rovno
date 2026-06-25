# T-Bank Edge Functions — Implementation Design (Phase 1b)

**Status:** Draft for review
**Last updated:** 2026-05-15
**Prerequisite:** phase 1a migrations applied на staging (`payment_intents`, `subscriptions` extension, `billing_customers` provider extension)
**Parent doc:** `tbank-integration-design.md`

## 1. Scope

Реализация трёх Supabase Edge Functions в `rovno-db/supabase/functions/`:

- `tbank-init-payment` — initiation платежа от фронта
- `tbank-notification` — webhook от Т-Банка с обновлением статуса
- `tbank-recurrent-charge` — cron-driven автосписания для recurrent подписок

Плюс два общих модуля в `_shared/`:

- `tbankAuth.ts` — SHA-256 token compute/verify
- `tbankApi.ts` — wrapper над T-Bank API endpoints

Плюс одна миграция для pg_cron job (phase 1b-mig — не путать с phase 1a).

**Out of scope этого документа** (отдельные phase'ы):

- Frontend (`/billing/checkout`, `/billing/success`, `/billing/fail`, settings billing tab) — phase 1c
- Подключение «Чеки от Т-Бизнеса» в личном кабинете Т-Банка — отдельная задача #8
- E2E тесты на staging — phase 1d (после deploy)

## 2. Architecture recap

```
┌─────────────┐       ┌──────────────────────┐       ┌─────────────────┐
│  Frontend   │──1───>│ tbank-init-payment   │──2───>│  T-Bank /Init   │
│  /billing   │       │  (Edge Function)     │<──3───│                 │
│             │<──4───│                      │       └─────────────────┘
│ T-Bank      │                                          │
│ JS-widget   │<─────5──────────────────────────────────┘
│ (iframe +   │       ┌──────────────────────┐
│ quick-pay)  │       │ tbank-notification   │<───6────T-Bank async
│             │       │  (Edge Function)     │
│             │       └─────────┬────────────┘
│             │                 │ 7
│             │                 ▼
│             │       ┌──────────────────────┐
│             │       │  Supabase Postgres   │
│             │       │  payment_intents,    │
│             │       │  subscriptions       │
│             │       └─────────┬────────────┘
│             │                 │
└─────────────┘                 │
                                │  pg_cron каждый час
                                ▼
                      ┌──────────────────────┐       ┌─────────────────┐
                      │ tbank-recurrent-     │──8───>│ T-Bank /Charge  │
                      │ charge (Edge Fn)     │<──9───│                 │
                      └──────────────────────┘       └─────────────────┘
                                │
                                └─10──> tbank-notification (как обычно)
```

## 3. `tbank-init-payment`

### 3.1 Endpoint contract

- **Path:** `POST /functions/v1/tbank-init-payment`
- **Auth:** Supabase JWT (юзер должен быть авторизован; `service_role` тоже допустим для admin-кейсов)
- **CORS:** allow origin = `https://rovno.ai`, `https://стройагент.рф`, `http://localhost:8080` (staging)

**Request body:**
```ts
{
  plan_code: 'master' | 'brigade',
  /** Email для отправки чека. Если не указан — берём из profiles.email. */
  receipt_email?: string,
  /** Если false — разовый платёж без Recurrent=Y. Default true. */
  auto_renew?: boolean,
  /** Frontend-генерируемый ключ, защищающий от дабл-сабмита. */
  idempotency_key?: string,
}
```

**Success response (200):**
```ts
{
  intent_id: string,        // uuid
  payment_id: string,       // T-Bank PaymentId
  status: 'new',
  amount_kopecks: number,
  plan_display_name: string,
}
```

**Error responses:**
- `400` — invalid `plan_code` или amount-validation fail
- `401` — нет JWT
- `409` — есть существующий active intent (status in `'pending','new','authorized'`) для этого профиля + plan_code → возвращаем existing payment_id вместо создания нового
- `502` — T-Bank вернул ошибку (с error_code из их ответа в body)

### 3.2 Логика (numbered)

1. Распарсить JWT → достать `profile_id`.
2. Прочитать `plan_code` из request body, валидировать.
3. Достать `(amount_kopecks, display_name)` из in-function plan config (см. §7.3).
4. **Idempotency check:**
   - Если `idempotency_key` передан и в БД уже есть intent с этим ключом → вернуть его (statu / payment_id) без нового Init.
   - Если ключ не передан, но есть intent с `status in ('pending','new','authorized')` для `(profile_id, plan_code)` созданный < 15 минут назад → вернуть существующий.
5. Insert row в `payment_intents`:
   - `provider='tbank'`, `status='pending'`, `order_id=intent.id::text`
   - `is_recurrent_setup = auto_renew` (true если автопродление включено)
   - `is_recurrent_charge=false`, `parent_intent_id=NULL`
6. Построить Receipt 54-ФЗ:
   ```ts
   {
     Email: receipt_email ?? profile.email,
     Phone: profile.phone ?? undefined,  // если есть
     Taxation: 'usn_income',
     Items: [{
       Name: `Подписка Rovno, план ${display_name}, 1 мес`,
       Quantity: 1,
       Amount: amount_kopecks,
       Price: amount_kopecks,
       Tax: 'none',                  // ИП на УСН без НДС
       PaymentMethod: 'full_prepayment',
       PaymentObject: 'service',
     }],
   }
   ```
7. Построить Init payload:
   ```ts
   {
     TerminalKey: env.TBANK_TERMINAL_KEY,
     Amount: amount_kopecks,
     OrderId: intent.order_id,
     Description: `Подписка Rovno, ${display_name}`,
     CustomerKey: profile_id,
     Recurrent: auto_renew ? 'Y' : undefined,
     NotificationURL: env.TBANK_NOTIFICATION_URL,
     SuccessURL: `https://rovno.ai/billing/success?intent=${intent.id}`,
     FailURL: `https://rovno.ai/billing/fail?intent=${intent.id}`,
     Receipt,
     // Token считается над всеми top-level fields кроме Receipt
   }
   ```
8. Подписать payload (см. §6.1).
9. `fetch(env.TBANK_INIT_URL + '/v2/Init', { method:'POST', body: JSON.stringify(payload), ... })` с таймаутом 15с.
10. На успех — update intent:
    - `external_payment_id = response.PaymentId`
    - `status = 'new'`
    - `receipt = stored Receipt jsonb`
11. На ошибку T-Bank (Success=false или non-2xx HTTP) — update intent:
    - `status = 'rejected'`
    - `error_code, error_message`
    - вернуть фронту 502 с error_message
12. На таймаут/network — intent остаётся `'pending'`, frontend может ретраить.
13. Вернуть успех фронту: `{ intent_id, payment_id, status:'new', amount_kopecks, plan_display_name }`.

### 3.3 Idempotency rules (важно)

- При повторном POST с тем же `idempotency_key`: тот же ответ, без вторичного Init в T-Bank.
- Без `idempotency_key` — sliding window 15 минут на `(profile_id, plan_code)` с активным intent.
- Frontend по дизайну генерирует `idempotency_key = crypto.randomUUID()` на загрузке `/billing/checkout` и хранит в state до успеха/fail.

### 3.4 Token signing

См. §6.1. Все top-level fields **кроме** `Receipt`, `DATA`, `Token` идут в подпись.

### 3.5 Security checklist

- [ ] Цена приходит из БД/конфига, не из request body (защита от подмены)
- [ ] `CustomerKey = profile_id` (T-Bank по нему группирует карты)
- [ ] `NotificationURL` из env, не из body
- [ ] Token подписан корректным password
- [ ] Все T-Bank URLs (test/prod) в env, не hardcoded
- [ ] CORS строго на allow-listed origins

## 4. `tbank-notification`

### 4.1 Endpoint contract

- **Path:** `POST /functions/v1/tbank-notification`
- **Auth:** **NO** Supabase JWT. Аутентификация через Token field (HMAC SHA-256).
- **CORS:** не применяется (server-to-server от T-Bank). Можно явно отключить.
- **Response:** `text/plain` с literal `"OK"` (T-Bank ждёт ровно эту строку)

T-Bank шлёт body примерно такой:
```json
{
  "TerminalKey": "...",
  "OrderId": "<наш intent.order_id>",
  "Success": true,
  "Status": "AUTHORIZED" | "CONFIRMED" | "REJECTED" | "CANCELED" | "REFUNDED" | "PARTIAL_REFUNDED",
  "PaymentId": "123456789",
  "ErrorCode": "0",
  "Amount": 260000,
  "RebillId": "456789",     // только при первом успехе с Recurrent=Y
  "CardId": 12345,
  "Pan": "430000******0777",
  "ExpDate": "1230",
  "Token": "<sha256_hex>"
}
```

### 4.2 Логика

1. Парсить body как JSON. Если фейл — 400, log warning.
2. Проверить `TerminalKey` совпадает с `env.TBANK_TERMINAL_KEY`. Если нет — 403.
3. **Verify Token** (см. §6.1). Если фейл — 403, log warning с OrderId.
4. SELECT intent по `order_id = body.OrderId`. Если нет — 404, log warning. T-Bank может ретраить, но если intent действительно нет — это либо bug либо подделка.
5. Сохранить raw body в `intent.last_notification` (jsonb) для дебага.
6. Маппинг `body.Status` → `intent.status`:
   - `AUTHORIZED` → `'authorized'` (set `authorized_at = now()`)
   - `CONFIRMED` → `'confirmed'` (set `confirmed_at = now()`)
   - `REJECTED` → `'rejected'` (set `error_code = body.ErrorCode`)
   - `CANCELED` → `'cancelled'` (set `cancelled_at = now()`)
   - `REFUNDED` → `'refunded'`
   - `PARTIAL_REFUNDED` → `'partial_refund'` (set `amount_refunded_kopecks = body.Amount`)
7. **Idempotency:** если `intent.status` уже равен новому — apply не делать (вернуть `"OK"`). Это защищает от ретраев T-Bank.
8. На переходе → `'confirmed'`:
   - Если `body.RebillId` присутствует — сохранить `intent.rebill_id`.
   - Вызвать `apply_confirmed_payment(intent_id)` внутри транзакции:
     - UPSERT в `billing_customers` `(profile_id, provider='tbank', external_customer_id=profile_id)` если нет (используем `profile_id` как `external_customer_id` для tbank, потому что у Т-Банка нет отдельного customer id).
     - Если есть текущая `is_current=true` subscription у профиля → пометить её `is_current=false, status='canceled', canceled_at=now()`.
     - INSERT new subscription:
       - `provider='tbank'`, `external_subscription_id = intent.external_payment_id`
       - `plan_code = intent.plan_code`
       - `status='active'`, `is_current=true`
       - `auto_renew = intent.is_recurrent_setup` (если intent был setup — да; recurrent_charge → копируем из parent)
       - `rebill_id = intent.rebill_id` (если есть)
       - `current_period_starts_at = now()`, `current_period_ends_at = now() + interval '1 month'`
       - `grace_until` computed автоматически (generated stored)
       - `amount_cents = intent.amount_kopecks` (формат `subscriptions` уже в копейках, см. phase 1a)
9. Вернуть `text/plain` ровно `"OK"`. Status 200.

### 4.3 Status state machine

```
   pending ─Init success──> new ─AUTHORIZED──> authorized ─CONFIRMED──> confirmed
      │                                              │                      │
      │                                              ▼                      ▼
      └──Init fail──> rejected                   cancelled        refunded / partial_refund
                                                     ▲
                                              CANCELED
```

Переход назад (например `confirmed → authorized`) — не допустимо, log warning и пропустить.

### 4.4 Security checklist

- [ ] Token verification mandatory — без него endpoint полностью открыт
- [ ] Constant-time comparison для Token (защита от timing attacks)
- [ ] No PII в логах (особенно Pan — даже маскированный)
- [ ] Rate limit (опционально) — 10 req/s на один OrderId

### 4.5 Response format (gotcha)

T-Bank считает webhook успешным только если response — exactly `"OK"` (plain text, без JSON). Любой другой ответ → ретрай. Поэтому даже на 404/403 возвращаем error code, а на success — строго `"OK"`.

## 5. `tbank-recurrent-charge`

### 5.1 Trigger

Cron job через `pg_cron`, frequency: **каждый час** (предлагаю; см. §11 open questions).

Cron вызывает Edge Function через `net.http_post` с `SERVICE_ROLE_KEY` в Authorization header.

### 5.2 Selection query

```sql
select s.id, s.profile_id, s.plan_code, s.rebill_id, s.amount_cents,
       s.current_period_ends_at
from public.subscriptions s
where s.provider = 'tbank'
  and s.is_current = true
  and s.auto_renew = true
  and s.rebill_id is not null
  and s.status = 'active'
  and s.current_period_ends_at <= now() + interval '1 day'
order by s.current_period_ends_at asc
limit 100;  -- batch size
```

Логика: при приближении истечения текущего периода (1 день до `current_period_ends_at`) — попытка автосписания.

### 5.3 Logic per subscription

1. Создать new intent: `is_recurrent_charge=true`, `parent_intent_id` ссылается на оригинальный (находим через `subscriptions.external_subscription_id == payment_intents.external_payment_id` где `is_recurrent_setup=true`).
2. Build Receipt — как в init, но Name = `Продление подписки Rovno, ${plan}, 1 мес`.
3. Build Init payload — но **без** Recurrent=Y (это уже сложилось при первом платеже).
4. Call `/v2/Init` → получить новый `PaymentId` для этой charge.
5. Call `/v2/Charge` с `{PaymentId, RebillId=subscription.rebill_id, Token}`.
6. Если Charge вернул `Status='AUTHORIZED'` или `'CONFIRMED'` — T-Bank пошлёт обычный notification, дальше всё как в §4.
7. Если Charge fail (карта истекла, нет средств, банк отказал):
   - `intent.status = 'rejected'` с error_code
   - Counter retry в `subscriptions` (новое поле? см. §11)
   - После N последовательных fail (см. §11) → `auto_renew=false`, шлём юзеру email "Обнови карту для продления Rovno" через Resend

### 5.4 Race condition

Между runs cron job могут перекрываться (один зависший на 1.5 часа, следующий стартует). Защита:

- Advisory lock per subscription: `pg_try_advisory_xact_lock(hashtext('tbank-charge-' || subscription.id))` в начале обработки каждой row.
- Если lock не взялся — пропускаем эту subscription в этом run.

### 5.5 Failure email template

Через существующий Resend setup (см. `_shared/projectInviteEmail.ts` как образец). Subject: `Не удалось продлить подписку Rovno`. Body: deeplink на `/settings?tab=billing` для обновления карты.

## 6. Shared helpers

### 6.1 `_shared/tbankAuth.ts`

```ts
/**
 * Computes T-Bank Token (SHA-256 hex) per их алгоритму:
 * 1. Берём все top-level пары (key, value) кроме исключённых (Receipt, DATA, Token, nested objects)
 * 2. Добавляем пару (Password, env.TBANK_PASSWORD)
 * 3. Сортируем по ключу
 * 4. Конкатенируем values в одну строку (без разделителей)
 * 5. SHA-256, hex
 */
export async function computeTbankToken(
  fields: Record<string, string | number | boolean>,
  password: string,
): Promise<string> { ... }

/**
 * Verify Token from incoming notification.
 * Use constant-time comparison.
 */
export async function verifyTbankToken(
  receivedToken: string,
  fields: Record<string, unknown>,
  password: string,
): Promise<boolean> { ... }
```

Тестировать на фикстурах из T-Bank docs (там есть несколько примеров).

### 6.2 `_shared/tbankApi.ts`

Thin wrappers, каждый принимает params + password, возвращает parsed response или throws.

```ts
export async function initPayment(
  params: TbankInitParams,
  config: TbankConfig,
): Promise<TbankInitResponse> { ... }

export async function chargePayment(
  params: { PaymentId: string; RebillId: string },
  config: TbankConfig,
): Promise<TbankChargeResponse> { ... }

export async function getPaymentState(
  paymentId: string,
  config: TbankConfig,
): Promise<TbankStateResponse> { ... }
```

`TbankConfig = { terminalKey, password, baseUrl }`.

## 7. Configuration

### 7.1 Env vars

| Variable | Where | Notes |
| --- | --- | --- |
| `TBANK_TERMINAL_KEY` | Supabase secrets (staging + prod, разные значения) | Test key до модерации, live key после |
| `TBANK_PASSWORD` | Supabase secrets | Никогда не светится клиенту |
| `TBANK_INIT_URL` | Supabase secrets | `https://securepay.tinkoff.ru` (prod), test URL из ЛК для staging |
| `TBANK_NOTIFICATION_URL` | Supabase secrets | Полный URL нашего webhook |
| `RESEND_API_KEY` | уже существует | Используется для card-update email |
| `SUPABASE_SERVICE_ROLE_KEY` | inject by Supabase | Для DB writes из Edge Functions |

### 7.2 Plan codes & prices

Хранятся в **двух местах** (по решению Влада — в коде):

- Frontend: `src/data/plans.ts` (TypeScript module)
- Edge Function: дубль в `_shared/plans.ts` (Deno-совместимый)

```ts
export const PLANS = {
  master: { display_name: 'Master', amount_kopecks: 260000 },   // 2 600 ₽
  brigade: { display_name: 'Brigade', amount_kopecks: 590000 }, // 5 900 ₽
} as const;
```

Цены — placeholders. Финальные подставит Влад после юнит-экономики (#4).

**Drift prevention:** в CI добавить скрипт `verify-plans-sync.mjs` который сравнивает оба файла. Если разошлись — fail.

## 8. pg_cron setup

Отдельная миграция: `20260516120300_setup_tbank_recurrent_cron.sql` (или позже timestamp если другие миграции wedged в между).

```sql
-- Включаем pg_cron extension (no-op если уже включен)
create extension if not exists pg_cron;

-- Job: каждый час вызываем tbank-recurrent-charge
select cron.schedule(
  'tbank-recurrent-charge',
  '0 * * * *',  -- каждый час в :00
  $$
  select net.http_post(
    url := current_setting('app.settings.tbank_recurrent_charge_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  )
  $$
);
```

`app.settings.*` configurable per-environment через `alter database … set …` (хотя в Supabase Cloud это устанавливается через Dashboard → Settings → Database → Database settings).

Альтернатива: вместо settings можно захардкодить URL и взять JWT из vault. Решим по ходу.

## 9. Testing

### 9.1 Unit (Deno)

- `_shared/tbankAuth.test.ts`: `computeTbankToken` на 5 fixture cases из T-Bank docs. `verifyTbankToken` happy + tampered cases.
- `_shared/plans.test.ts`: drift check между frontend и Edge Function.
- `_shared/tbankApi.test.ts`: mock fetch, проверка request shape.

### 9.2 Integration (deployed staging)

- POST к `tbank-init-payment` с тестовой картой → ожидаем `payment_id`.
- POST к `tbank-notification` с подделанным Token → 403.
- POST к `tbank-notification` с правильным Token и `Status=CONFIRMED` для existing intent → 200 + `"OK"` + subscription created.
- Дабл-нотификация одинаковая → не создаёт дублирующую subscription.

### 9.3 E2E (staging + frontend phase 1c)

См. `tbank-integration-design.md` §9.

## 10. Deployment

Order:

1. **Phase 1a applied** (миграции уже на staging — prerequisite).
2. **Apply pg_cron migration** на staging: `supabase db push --linked`.
3. **Set secrets** на staging:
   ```bash
   supabase secrets set --project-ref aaycwobhdkrrgfxwcfxg \
     TBANK_TERMINAL_KEY=... TBANK_PASSWORD=... TBANK_INIT_URL=... TBANK_NOTIFICATION_URL=...
   ```
4. **Deploy functions**:
   ```bash
   supabase functions deploy tbank-init-payment --project-ref aaycwobhdkrrgfxwcfxg
   supabase functions deploy tbank-notification --project-ref aaycwobhdkrrgfxwcfxg
   supabase functions deploy tbank-recurrent-charge --project-ref aaycwobhdkrrgfxwcfxg
   ```
5. **Sanity check**:
   - `curl https://aaycwobhdkrrgfxwcfxg.supabase.co/functions/v1/tbank-notification -X POST -d '{}'` → ожидаем 403 (no Token).
   - В Supabase Dashboard → Cron видим job `tbank-recurrent-charge` со schedule `0 * * * *`.
6. **Update T-Bank merchant config** в личном кабинете эквайринга: NotificationURL = `https://aaycwobhdkrrgfxwcfxg.supabase.co/functions/v1/tbank-notification`.

Prod rollout — после phase 1c (frontend) + модерации Т-Банка.

## 11. Resolved decisions (for phase 1b)

| # | Decision | Implementation |
| - | -------- | -------------- |
| 11.1 | Cron каждый час | `cron.schedule('tbank-recurrent-charge', '0 * * * *', ...)` |
| 11.2 | 1 попытка → `auto_renew=false` + email | На charge fail: один update в `subscriptions` + один Resend call. Никакого `retry_count` поля не нужно — простая модель |
| 11.3 | SERVICE_ROLE_KEY в Postgres setting | `alter database <db> set app.settings.service_role_key = '...'` (через Supabase Dashboard для cloud, через psql для self-hosted prod). pg_cron читает через `current_setting()` |
| 11.4 | `CustomerKey = profile_id` (UUID) | Принято as-is (см. §3.2 step 7) |
| 11.5 | Early-notification race | Mitigation в §4.2 step 4 (lookup по `order_id` сначала). Принято as-is |

---

## Next steps после ревью

1. Влад читает doc, отвечает на 5 open questions (или говорит "решай сам / предложенное OK")
2. Я создаю handoff-промпт для Claude Code на реализацию phase 1b:
   - 2 shared модуля
   - 3 Edge Functions
   - 1 миграция pg_cron
   - Unit tests
   - Deploy script
3. Параллельно — handoff на независимый аудит, как мы делали с миграциями
4. После аудита + deploy на staging — переходим к phase 1c (frontend)
