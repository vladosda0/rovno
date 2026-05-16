# T-Bank Internet Acquiring — Integration Design (B+C)

**Status:** Draft for review
**Author:** Claude + Vlad
**Last updated:** 2026-05-15

## 1. Цель и scope

Принимать платежи на rovno.ai через интернет-эквайринг АО «ТБанк» для подписочной модели SaaS-сервиса.

**Чем отличается этот дизайн:** мы выбрали вариант **B+C** из 4 возможных (см. roadmap, задача #6):

- **B**: iframe-форма Т-Банка встроена в страницу `/billing/checkout`. Пользователь не покидает rovno.ai, но видит брендинг Т-Банка внутри iframe.
- **C**: над iframe рендерим виджет «быстрой оплаты» от Т-Банка (T-Pay, СБП, SberPay, Alfa Pay). Для пользователей с приложениями этих банков на телефоне это 1-2 тапа до оплаты.

Это даёт максимум доверия (брендинг Т-Банка везде) при максимуме UX (не уходим со страницы; mobile-flow за 2 тапа).

**Out of scope этого документа** (отдельные задачи):

- Юнит-экономика и финальные цены (#4) — этот документ не фиксирует суммы, использует переменные.
- UI-правки блока тарифов на лендинге (#5) — этот документ описывает только страницу оформления, а не сам блок тарифов.
- 54-ФЗ детали по подключению Чеков от Т-Бизнеса в личном кабинете (#8) — этот документ описывает только формат `Receipt` в API-запросах.

## 2. Архитектурный обзор

### 2.1 Где живёт каждый кусок

| Слой | Где живёт | Что добавляем |
| --- | --- | --- |
| Frontend (React/Vite) | `rovno` (этот репо) | Страницы `/billing/checkout`, `/billing/success`, `/billing/fail`; компоненты `TBankIframeWidget`, `TBankQuickPayWidget`, `PlanSummary` |
| Database (SQL) | `rovno-db/supabase/migrations/` | Миграция: расширить `subscriptions.provider` и `billing_customers.provider` чек-констрейнты + новая таблица `payment_intents` + RLS |
| Backend (Edge Functions) | `rovno-db/supabase/functions/` | `tbank-init-payment` (создание платежа), `tbank-notification` (webhook от Т-Банка) |
| Конфиг секретов | `supabase secrets` (staging и prod отдельно) | `TBANK_TERMINAL_KEY`, `TBANK_PASSWORD`, `TBANK_NOTIFICATION_URL` |

Существующие таблицы `billing_customers` и `subscriptions` в `rovno-db` (миграция `20260306165000`) переиспользуем, только расширим список разрешённых провайдеров (сейчас разрешён только `stripe`).

### 2.2 Sequence flow

```text
                    Frontend (rovno.ai)          Edge Functions (rovno-db)         T-Bank API           Supabase DB
                          │                              │                              │                    │
1. Открыть /checkout      │                              │                              │                    │
   с auth-сессией ────────┤                              │                              │                    │
                          │                              │                              │                    │
2. POST tbank-init        │─────────────────────────────>│                              │                    │
   {plan_code, email}     │                              │                              │                    │
                          │                              ├─ insert pending intent ─────────────────────────>│
                          │                              │                              │                    │
                          │                              ├─ POST /v2/Init ─────────────>│                    │
                          │                              │     {Amount,OrderId,         │                    │
                          │                              │      Receipt,Token,...}      │                    │
                          │                              │<──────────────────── 200 OK ─┤                    │
                          │                              │     {PaymentId, PaymentURL}  │                    │
                          │                              ├─ update intent.external_id ──────────────────────>│
                          │<─── {paymentId} ─────────────│                              │                    │
                          │                              │                              │                    │
3. Init iframe widget     │                              │                              │                    │
   и quick-pay buttons    │                              │                              │                    │
   с paymentId            │                              │                              │                    │
                          │                              │                              │                    │
4. Пользователь           │                              │                              │                    │
   вводит карту /         │                              │                              │                    │
   жмёт T-Pay /           │                              │                              │                    │
   жмёт СБП               │                              │                              │                    │
                          │── ────────────────────────────────────────────────────────>│                    │
                          │                              │                              │                    │
5. T-Bank webhook         │                              │<─── POST notification ───────┤                    │
   (status=AUTHORIZED,    │                              │     {Status, Token, ...}     │                    │
    затем CONFIRMED)      │                              │                              │                    │
                          │                              ├─ verify Token (SHA-256) ────┤                    │
                          │                              ├─ update intent.status ──────────────────────────>│
                          │                              ├─ if CONFIRMED:              │                    │
                          │                              │     upsert billing_customer  │                    │
                          │                              │     insert subscription      │                    │
                          │                              │     mark is_current=true ───────────────────────>│
                          │                              ├──── 200 "OK" ───────────────>│                    │
                          │                              │                              │                    │
6. T-Bank сам шлёт        │                              │                              │                    │
   чек 54-ФЗ на email     │                              │                              │                    │
                          │                              │                              │                    │
7. Frontend (realtime/    │                              │                              │                    │
   polling) видит         │                              │                              │                    │
   confirmed → redirect   │                              │                              │                    │
   на /billing/success    │                              │                              │                    │
```

## 3. Database schema

### 3.1 Миграция: расширить provider check-constraint

Файл: `rovno-db/supabase/migrations/2026XXXXHHMM_extend_billing_provider_to_tbank.sql`

```sql
-- Расширяем allowed providers: добавляем 'tbank' к существующему 'stripe'.
-- Stripe оставляем на случай если в будущем будет нужно (USD/EUR подписки).

alter table public.billing_customers
  drop constraint if exists billing_customers_provider_check;
alter table public.billing_customers
  add constraint billing_customers_provider_check
  check (provider in ('stripe', 'tbank'));

alter table public.subscriptions
  drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check
  check (provider in ('stripe', 'tbank'));
```

### 3.2 Миграция: новая таблица `payment_intents`

Файл: `rovno-db/supabase/migrations/2026XXXXHHMM_create_payment_intents.sql`

```sql
create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('tbank')),

  -- Внешний идентификатор платежа в T-Bank (PaymentId)
  external_payment_id text,
  -- OrderId который мы передаём в T-Bank Init. По умолчанию равен intent.id.
  order_id text not null,

  plan_code text not null,
  amount_kopecks bigint not null check (amount_kopecks > 0),
  currency text not null default 'RUB' check (currency = 'RUB'),

  status text not null default 'pending' check (status in (
    'pending',        -- intent создан, Init ещё не вызван
    'new',            -- T-Bank принял Init, юзер ещё не оплатил
    'authorized',     -- 3DS прошёл, средства "забронированы"
    'confirmed',      -- средства списаны
    'rejected',       -- отказ
    'cancelled',      -- отменён
    'refunded',       -- возврат полный
    'partial_refund'  -- возврат частичный
  )),
  amount_refunded_kopecks bigint not null default 0 check (amount_refunded_kopecks >= 0),

  -- Снимок Receipt-объекта 54-ФЗ для этого платежа (Items, Taxation, email/phone)
  receipt jsonb,
  -- Последний raw notification от T-Bank (для дебага)
  last_notification jsonb,

  -- Защита от ретраев на init со стороны фронта
  idempotency_key text unique,

  error_code text,
  error_message text,

  authorized_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payment_intents_profile on public.payment_intents(profile_id);
create index idx_payment_intents_external on public.payment_intents(external_payment_id);
create index idx_payment_intents_order on public.payment_intents(order_id);
create index idx_payment_intents_status on public.payment_intents(status) where status in ('pending', 'new', 'authorized');

create trigger set_payment_intents_updated_at
before update on public.payment_intents
for each row execute function public.set_updated_at();

alter table public.payment_intents enable row level security;

-- Юзер видит только свои intent'ы (для polling/realtime status на фронте).
create policy "payment_intents_self_select"
on public.payment_intents for select
using (auth.uid() = profile_id);

-- Insert/Update — только через service_role (Edge Functions).
-- Никаких client-side политик на write.
```

### 3.3 Что происходит после `confirmed`

Edge Function `tbank-notification` в транзакции:

1. Апсертит row в `billing_customers` для `(profile_id, provider='tbank')` если её нет (external_customer_id = profile_id или специальный T-Bank customer id; уточним по доке).
2. Помечает текущую `is_current=true` subscription того же profile_id как `is_current=false, status='canceled', canceled_at=now()`.
3. Вставляет новую row в `subscriptions` с:
   - `provider='tbank'`
   - `external_subscription_id` = `payment_intents.external_payment_id` (для разового платежа = paymentId; для recurrent — `RebillId`)
   - `plan_code` = `payment_intents.plan_code`
   - `status='active'`, `is_current=true`
   - `current_period_starts_at=now()`, `current_period_ends_at=now() + interval '1 month'`
   - `amount_cents` = `payment_intents.amount_kopecks` (формат таблицы — cents/копейки)

## 4. Edge Functions

Обе функции — Deno-based, structure как `ai-inference` и `send-project-invite`: одна папка с `index.ts`, общие модули из `_shared/`.

### 4.1 `tbank-init-payment`

**Путь:** `rovno-db/supabase/functions/tbank-init-payment/index.ts`
**Endpoint:** `POST /functions/v1/tbank-init-payment`
**Auth:** Supabase JWT (юзер должен быть авторизован)

**Request body:**
```ts
{
  plan_code: 'master' | 'brigade',
  // опционально — для разделения email-чека и личного email
  receipt_email?: string,
}
```

**Логика:**
1. Достаёт `profile_id` из JWT.
2. Достаёт plan-конфиг (`amount_kopecks`, `display_name`) — где хранить, см. §11.2.
3. Idempotency check: если у профиля есть `payment_intents` с `status in ('pending', 'new', 'authorized')` и `plan_code` совпадает, и `created_at > now() - interval '15 minutes'` — возвращаем существующий `external_payment_id` без нового Init.
4. Иначе: вставляет row в `payment_intents` с `status='pending', order_id=gen_random_uuid()`.
5. Формирует Receipt 54-ФЗ:
   ```json
   {
     "Email": "<receipt_email or profile.email>",
     "Phone": "<profile.phone if present>",
     "Taxation": "usn_income",
     "Items": [{
       "Name": "Подписка Rovno, план <display_name>, 1 мес",
       "Quantity": 1,
       "Amount": <amount_kopecks>,
       "Price": <amount_kopecks>,
       "Tax": "none",
       "PaymentMethod": "full_prepayment",
       "PaymentObject": "service"
     }]
   }
   ```
6. Формирует Token (SHA-256 HMAC по схеме T-Bank: сортировка всех top-level полей по ключу, конкатенация values, добавление Password, hash).
7. Зовёт `POST https://securepay.tinkoff.ru/v2/Init` (test или prod URL зависит от ключа):
   ```json
   {
     "TerminalKey": "...",
     "Amount": <amount_kopecks>,
     "OrderId": "<intent.order_id>",
     "Description": "Подписка Rovno <plan>",
     "NotificationURL": "<TBANK_NOTIFICATION_URL>",
     "SuccessURL": "https://rovno.ai/billing/success?intent=<intent.id>",
     "FailURL": "https://rovno.ai/billing/fail?intent=<intent.id>",
     "Receipt": { ... },
     "Token": "<sha256>"
   }
   ```
8. Парсит ответ; при ошибке — `intent.status='rejected'`, error_code/message; возвращает 502 фронту.
9. При успехе — `intent.external_payment_id=PaymentId`, `intent.status='new'`. Возвращает фронту:
   ```ts
   {
     intent_id: '<uuid>',
     payment_id: '<PaymentId>',
     status: 'new'
   }
   ```

**Env-vars:** `TBANK_TERMINAL_KEY`, `TBANK_PASSWORD`, `TBANK_NOTIFICATION_URL`, `TBANK_INIT_URL` (test/prod).

### 4.2 `tbank-notification`

**Путь:** `rovno-db/supabase/functions/tbank-notification/index.ts`
**Endpoint:** `POST /functions/v1/tbank-notification`
**Auth:** **Не** Supabase JWT. Это публичный endpoint, который зовёт сервер Т-Банка. Аутентификация через Token-поле HMAC.

**T-Bank шлёт body (примерно):**
```json
{
  "TerminalKey": "...",
  "OrderId": "...",
  "Success": true,
  "Status": "CONFIRMED",
  "PaymentId": 123456,
  "ErrorCode": "0",
  "Amount": 260000,
  "RebillId": null,
  "CardId": 789,
  "Pan": "430000******0777",
  "ExpDate": "1230",
  "Token": "<sha256>"
}
```

**Логика:**
1. Парсит body.
2. Верифицирует Token:
   - Берёт все поля кроме `Token` и кроме nested-объектов.
   - Добавляет `Password` = `TBANK_PASSWORD`.
   - Сортирует пары `(key, value)` по ключу.
   - Конкатенирует values в строку.
   - Считает SHA-256 hex.
   - Сравнивает с присланным `Token`. Если не совпадает — `403`, log с уровнем warning, **не повторно ретраить** на стороне Т-Банка не получится, но лог нам нужен для алертов.
3. Достаёт `payment_intents` по `OrderId` (== `intent.order_id`). Если нет — `404`. T-Bank поретраит, но если нет — это либо OrderId перепутан, либо подделка.
4. Сохраняет raw в `intent.last_notification` (для дебага).
5. Маппит `Status` → `intent.status`:
   - `AUTHORIZED` → `'authorized'`, set `authorized_at`
   - `CONFIRMED` → `'confirmed'`, set `confirmed_at`
   - `REJECTED` → `'rejected'`, set `error_code`, `error_message`
   - `CANCELED` → `'cancelled'`, set `cancelled_at`
   - `REFUNDED` → `'refunded'`
   - `PARTIAL_REFUNDED` → `'partial_refund'`
6. Идемпотентность: если `intent.status` уже `confirmed` и notification снова `CONFIRMED` — просто возвращаем `"OK"`, ничего не апплаим повторно.
7. Если переход `→ confirmed` — вызывает внутреннюю функцию `apply_confirmed_payment(intent_id)`:
   - В транзакции: апсерт `billing_customer`, инвалидация старой `is_current` subscription, инсерт новой subscription. См. §3.3.
8. Возвращает `text/plain` ответом `"OK"` (T-Bank ждёт ровно эту строку — иначе считает что webhook упал и поретраит).

**Что не делать:**
- Не отвечать `200 OK { json }` — только `"OK"` plain text.
- Не блокировать webhook долгими операциями. Если apply занимает > 5 сек — выносим в background queue, отвечаем "OK" сразу, обработка асинхронно.

### 4.3 Shared утилиты в `rovno-db/supabase/functions/_shared/`

Новый файл: `tbankAuth.ts`
```ts
// Считает SHA-256 Token для T-Bank request/response.
// Используется и в init-payment (отправка), и в notification (валидация).
export async function computeTbankToken(
  fields: Record<string, string | number | boolean>,
  password: string,
): Promise<string> { ... }
```

Новый файл: `tbankApi.ts`
```ts
// Тонкая обёртка над T-Bank /Init, /Confirm, /Cancel, /GetState.
// Все методы добавляют Token автоматически.
export async function initPayment(...): Promise<TbankInitResponse> { ... }
export async function getPaymentState(...): Promise<TbankStateResponse> { ... }
```

## 5. Frontend

### 5.1 Новые роуты

В `src/App.tsx` под Auth-required layout:

```tsx
<Route path="/billing/checkout" element={routeElement(<BillingCheckout />)} />
<Route path="/billing/success" element={routeElement(<BillingSuccess />)} />
<Route path="/billing/fail" element={routeElement(<BillingFail />)} />
```

### 5.2 `BillingCheckout` page

Содержит:

- `<BetaBar />` сверху (как везде)
- `<PlanSummary plan={plan}/>` — название плана, цена, что входит
- `<TBankQuickPaySection paymentId={paymentId}/>` — quick-pay виджеты (T-Pay, СБП, SberPay/AlfaPay автоматически)
- `<Divider>или картой</Divider>`
- `<TBankIframeSection paymentId={paymentId}/>` — iframe-форма
- `<TBankDisclaimer />` — "Оплата защищена АО «ТБанк». Чек придёт на {email}." + ссылка `tbank.ru`

При mount:
1. Достаёт `?plan=master` из URL.
2. Вызывает `tbank-init-payment` через supabase functions client.
3. Получает `paymentId`, инициализирует виджеты.
4. Подписывается на supabase realtime channel `payment_intents:id=eq.<intent_id>` для status update.
5. Когда `status='confirmed'` → `navigate('/billing/success?intent=<id>')`.
6. Когда `status='rejected'` → toast с ошибкой, кнопка "Попробовать снова" (повторно зовёт init с новым idempotency-окном).

### 5.3 `BillingSuccess`/`BillingFail`

Простые страницы:

- **Success**: иконка ✓, "Подписка активирована до DD.MM.YYYY", кнопки "В рабочее пространство" → `/home`, "Скачать чек" (опционально — T-Bank сам пришлёт на email).
- **Fail**: иконка ✗, "Платёж не прошёл. Возможно, недостаточно средств или банк отклонил операцию.", кнопки "Попробовать снова" → `/billing/checkout?plan=...` и "В тарифы".

### 5.4 T-Bank JS-виджеты

Подключаем скрипт T-Bank по их инструкции (`https://acdn.tbank.ru/static/web-acquiring/checkout.js` или подобный URL — уточним по доке при #7). Для виджетов:

- `TBankQuickPayWidget` рендерит `<div data-tbank-quick-pay paymentId={paymentId}>` и инициализирует JS-объект `integration.speedpay.init(...)`.
- `TBankIframeWidget` рендерит `<div id="tbank-iframe-target">` и `integration.iframe.connect(target, paymentId)`.

Конкретный API JS-виджета — уточняется по доке T-Bank, может незначительно меняться. Документ обновим перед стартом #7.

### 5.5 Pricing → Checkout

На лендинге (после #5 UI правок) кнопка плана "Продолжить" имеет href:

- Если auth → `/billing/checkout?plan=master`
- Если не auth → `/auth/signup?return=/billing/checkout?plan=master`

## 6. Безопасность

| Угроза | Митигация |
| --- | --- |
| Подделка notification (фейковая активация подписки) | Token verification SHA-256, secrets хранятся только в Edge Function env |
| Двойное apply при ретраях notification | Idempotency: проверка `intent.status` до apply; уникальный constraint на `(provider, external_subscription_id)` |
| MITM / sniff карточных данных | Карты вводятся в iframe T-Bank (на их домене), наш сервер их не видит. TLS 1.2+ везде |
| Init с фронта с подменённой суммой | Init вызывается с **бэка** (Edge Function), сумма достаётся из БД по plan_code, не из request body |
| Race condition на subscription | Уникальный partial index `idx_subscriptions_current_per_profile` где `is_current=true`; транзакционный апсерт |
| RLS leak (юзер видит чужие intent'ы) | RLS policy `payment_intents_self_select` фильтрует по `auth.uid()` |

## 7. 54-ФЗ чеки

- ИП на УСН (доходы) — чеки **обязательны**.
- Подключаем сервис «Чеки от Т-Бизнеса» в личном кабинете (этап #8). Стоимость 0 ₽/мес при работе с интернет-эквайрингом Т-Банка.
- В каждом `Init` передаём `Receipt` объект (см. §4.1).
- T-Bank сам:
  1. Формирует фискальный чек.
  2. Шлёт в ОФД.
  3. Отправляет копию на `Receipt.Email`.
  4. Передаёт в ФНС.
- На нашей стороне — только формирование `Receipt` объекта в Init.

## 8. Env-vars и secrets

В `rovno-db/supabase/functions/.env` (gitignored) и в `supabase secrets set` для каждого env:

| Variable | Where set | Notes |
| --- | --- | --- |
| `TBANK_TERMINAL_KEY` | secrets staging + prod | Разный для test и prod |
| `TBANK_PASSWORD` | secrets staging + prod | Никогда не светится клиенту |
| `TBANK_INIT_URL` | secrets staging + prod | `https://securepay.tinkoff.ru/v2/Init` (prod). Test URL — из личного кабинета |
| `TBANK_NOTIFICATION_URL` | secrets staging + prod | Полный URL нашего webhook, который сообщаем Т-Банку при настройке терминала |

Команды настройки:
```bash
# Staging (Cloud Supabase project)
supabase secrets set --project-ref aaycwobhdkrrgfxwcfxg \
  TBANK_TERMINAL_KEY=... TBANK_PASSWORD=... TBANK_INIT_URL=...

# Prod (self-hosted) — через ./scripts/deploy-prod-function.sh или прямой psql
```

## 9. Тестирование

### 9.1 Тестовые карты (T-Bank docs)

- `4300 0000 0000 0777` — успех с 3DS
- `4000 0000 0000 0002` — отказ
- `5555 5555 5555 4444` — успех без 3DS

### 9.2 E2E-сценарии

| # | Сценарий | Ожидаемое |
| - | -------- | --------- |
| 1 | Успешная оплата картой через iframe | Init → 200, юзер вводит `4300...0777`, проходит 3DS → notification AUTHORIZED → notification CONFIRMED → subscription активна, чек на email |
| 2 | Успешная оплата через T-Pay | Init → 200, юзер жмёт T-Pay кнопку в quick-pay, попадает в приложение T-Bank → подтверждает → notification CONFIRMED |
| 3 | Успешная оплата через СБП | Init → 200, юзер сканирует/жмёт СБП → notification CONFIRMED |
| 4 | Отказ карты | Тестовая карта `4000...0002` → REJECTED → status='rejected', toast |
| 5 | 3DS отмена пользователем | Юзер вводит карту, в 3DS жмёт "Отмена" → CANCELED → status='cancelled' |
| 6 | Double notification idempotency | T-Bank ретраит notification 2 раза → второй apply не делает дубликат subscription |
| 7 | Полный refund | Из dashboard T-Bank refund → notification REFUNDED → status='refunded', subscription→canceled |
| 8 | Частичный refund | Refund 50% → status='partial_refund', `amount_refunded_kopecks` обновлён |
| 9 | Подделка notification | Curl с подделанным Token → 403 в логах, intent не меняется |
| 10 | Init с подмененной суммой через фронт | Невозможно: сумма достаётся из БД по plan_code |
| 11 | Init во время уже активного pending | Idempotent: вернётся существующий PaymentId, не создастся новый |

### 9.3 Unit-тесты

- `tbankAuth.ts`: `computeTbankToken` — тесты на фикстурах из доки T-Bank.
- `apply_confirmed_payment`: integration test через supabase test client.
- Frontend smoke: `BillingCheckout` рендерится без падений на mock'ах.

## 10. Rollout plan

### Phase 1: реализация на staging (5-7 рабочих дней)

1. PR в `rovno-db` с миграциями (`extend_billing_provider`, `create_payment_intents`).
2. Применение на staging Cloud Supabase (`supabase db push --linked`).
3. Регенерация `backend-truth/` в `rovno` через GitHub Actions sync PR.
4. PR в `rovno` с edge functions deploy + frontend pages.
5. `supabase secrets set` для test ключей в staging project ref.
6. E2E прогон сценариев 1-11 на staging URL.

### Phase 2: модерация банка (до 2 дней)

7. Подача анкеты в личном кабинете Т-Бизнеса. Compliance страницы (`/offer`, `/privacy`, `/refund`, `/contacts`) уже в `dev` после PR #86, к моменту подачи будут в проде.
8. Прохождение проверки сайта.
9. Получение боевого TerminalKey/Password.

### Phase 3: prod rollout (2-3 дня)

10. Применение миграций на prod self-hosted (`psql $PROD_DATABASE_URL -f <migration>.sql`).
11. Deploy edge functions на prod (через `./scripts/deploy-prod-function.sh tbank-init-payment` и `tbank-notification`).
12. `supabase secrets set` для боевых ключей на prod.
13. **Feature flag**: `VITE_BILLING_ENABLED=false` на проде. Деплой кода. Доступ к `/billing/checkout` только по прямой ссылке.
14. Smoke-тест собственной картой Влада на минимальной сумме (10 ₽).
15. Полный E2E на проде.
16. `VITE_BILLING_ENABLED=true`, кнопки "Продолжить" на тарифах активны.
17. Мониторинг 7 дней: конверсия в оплату, ошибки Init, ошибки notification, отказы карт.

### Rollback план

Если что-то идёт не так на prod:
- Быстрый откат: `VITE_BILLING_ENABLED=false` в Timeweb env → redeploy frontend. Платежи отключены за 2-3 минуты.
- Edge functions: не нужно откатывать, они просто перестают вызываться.
- Миграции БД: append-only, не откатываем (constraint расширение не ломающее).

## 11. Принятые решения (для перехода к #7)

| # | Вопрос | Решение | Следствие |
| - | ------ | ------- | --------- |
| 11.1 | Recurrent payments | **Включаем сразу** | См. §12 — расширение дизайна на recurrent |
| 11.2 | Где хранить цены | **В коде** (`src/data/plans.ts` + дубль в Edge Function) | При смене цены — деплой. На MVP норм. Миграция на табл. `plans` — отдельно после понимания churn |
| 11.3 | Политика возврата | **Шаблон в `/refund` остаётся** (14 дней + пропорционально) | Не блокирует. Если поменяется — отдельный PR на `/refund` и `/offer` |
| 11.4 | После истечения подписки | **Soft-cancel + 7 дней grace** | Активная подписка = `is_current AND now() < current_period_ends_at + interval '7 days'`. Уведомления за 3 дня и в день окончания. Реализация feature-gates через единый хук `useActiveSubscription` |

## 12. Расширение дизайна на recurrent payments

С решением 11.1 (autorebill включаем сразу) добавляются следующие изменения относительно базового дизайна выше.

### 12.1 БД: дополнительные поля

К миграции `create_payment_intents` добавляются поля:
```sql
-- Для первого платежа с Recurrent='Y' — T-Bank вернёт RebillId после Authorized.
-- Для последующих авто-списаний — будем создавать новые intent'ы, но без виджета,
-- через серверный /Charge с этим rebill_id.
rebill_id text,
is_recurrent_setup boolean not null default false,   -- true когда intent был запросом на привязку
is_recurrent_charge boolean not null default false,  -- true когда intent — авто-списание
parent_intent_id uuid references public.payment_intents(id), -- ссылка на первичный intent с rebill_id
```

К таблице `subscriptions` добавляется через отдельную миграцию (или включаем в migration #3.2):
```sql
alter table public.subscriptions
  add column auto_renew boolean not null default true,
  add column rebill_id text;
```

### 12.2 Edge Functions: дополнения

**`tbank-init-payment`** — в Init теперь передаём:
- `Recurrent: 'Y'`
- `CustomerKey: <profile_id>` (T-Bank по этому ключу группирует карты клиента)
- `Receipt` остаётся как раньше (для каждого платежа отдельный чек)

**Новая Edge Function: `tbank-recurrent-charge`**
- Путь: `rovno-db/supabase/functions/tbank-recurrent-charge/index.ts`
- Триггер: **cron** (Supabase `pg_cron` extension) раз в час
- Логика:
  1. SELECT из `subscriptions` где `provider='tbank' AND is_current=true AND auto_renew=true AND current_period_ends_at <= now() + interval '1 day' AND rebill_id IS NOT NULL`
  2. Для каждой: создать intent `is_recurrent_charge=true`, `parent_intent_id` указать на первичный
  3. Вызвать `POST /v2/Init` с обычными параметрами + получить новый PaymentId
  4. Вызвать `POST /v2/Charge` с `PaymentId` и `RebillId` — это автосписание без участия юзера
  5. Дальше идёт стандартный notification flow → апгрейд subscription на следующий период
  6. Fail handling: если 3DS или отказ карты — `auto_renew=false`, отправить юзеру email "обнови карту" с deeplink на `/settings?tab=billing`

### 12.3 Frontend: дополнения

**На `/billing/checkout`** под disclaimer добавить чекбокс (по умолчанию активен):
```
[✓] Автопродление подписки каждый месяц
    Можно отменить в любой момент в настройках
```
Если снят — Init вызывается без `Recurrent='Y'`. Простой разовый платёж.

**Новая страница `/settings?tab=billing`** (или подвкладка существующего Settings):
- Текущая подписка: план, период, дата окончания
- Тоггл "Автопродление" с возможностью включить/выключить (server call → `subscriptions.auto_renew`)
- История платежей: список последних 12 intents с paid_at и amount
- Кнопка "Отменить подписку" — устанавливает `auto_renew=false` + текст что подписка останется активной до конца оплаченного периода
- Кнопка "Обновить карту" если auto-charge зафейлился — заново зовёт `tbank-init-payment` в setup-mode

### 12.4 Rollout: дополнительные шаги

К фазам §10 добавляются:
- **Phase 1 staging**: настроить `pg_cron` для триггера `tbank-recurrent-charge` каждый час, протестировать на тестовом ключе с ускоренными периодами (subscription period = 5 минут вместо месяца для прогона)
- **Phase 3 prod**: включить cron на prod, но сначала рукотворный smoke первого автосписания (по 10 ₽ подписке)

---

## Next steps после ревью этого документа

1. ✓ Все 4 открытых вопроса закрыты (§11)
2. Влад читает doc и пингует если есть правки
3. Я создаю PR с этим документом в `dev` (этот файл уже в ветке `feature/tbank-integration-design`)
4. Старт реализации (#7): сначала PR в `rovno-db` с миграциями (`payment_intents` + recurrent fields + provider check extension), потом PR в `rovno` с Edge Functions и frontend
