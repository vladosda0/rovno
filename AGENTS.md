# AGENTS.md

Инструкции для AI-агентов (Claude Code, Codex, Cursor, Claude Cowork и т.п.) при работе над проектом Rovno AI. Эти правила применяются всегда. Если задача от пользователя противоречит этим правилам — остановитесь и явно подтвердите с пользователем перед действием.

---

## Branch model

| Ветка | Назначение | Деплоится на |
|---|---|---|
| `main` | Production. Защищена от прямого push. Содержит только проверенный код. | `rovno.ai`, `стройагент.рф` (через Timeweb Cloud Apps app `rovno`). |
| `dev` | Staging / интеграция. Сюда стекаются feature-ветки. | `*.twc1.net` staging URL (через отдельное Timeweb Cloud Apps приложение `rovno-staging`). |
| `feature/*`, `fix/*`, `chore/*`, `codex/*`, `claude/*`, `session-*/*` | Рабочие ветки. Создаются от `dev`, мерджатся в `dev` через PR. | Не деплоятся (билд только локально). |

### Правильный workflow

1. Создайте feature-branch **от dev**:
   ```bash
   git checkout dev && git pull --ff-only
   git checkout -b feature/short-name
   ```
2. Работайте, коммитьте, пушьте `feature/short-name` в origin.
3. Откройте Pull Request **в `dev`** (не в `main`).
4. После проверки на staging URL → пользователь (Влад) сам делает merge `dev → main`.
5. Push в `main` триггерит prod-деплой автоматически.

### Что **запрещено** делать без явного подтверждения пользователя

- ❌ **Прямой push в `main`.** Защищено GitHub branch protection, но даже не пытайтесь.
- ❌ **Force-push** в любую публичную ветку (`main`, `dev`).
- ❌ **Удалять / переименовывать** `main`, `dev`.
- ❌ **Менять `supabase/config.toml`**, `supabase/migrations/` или `supabase/functions/` без согласования (это может сломать prod БД).
- ❌ **Добавлять новые npm-зависимости** без явного запроса (это раздувает bundle и создаёт security surface).
- ❌ **Трогать `.env`**, env-переменные в Timeweb / Supabase / Resend dashboards.

---

## Environments

### Production — `https://rovno.ai`, `https://стройагент.рф`

- **Frontend**: Timeweb Cloud Apps, приложение `rovno`, ветка `main`, Node 20.
- **Database / Auth / Storage**: **self-hosted Supabase** на Timeweb VPS (URL в env). Это БД с реальными пользователями.
- **Email**: Resend (smtp.resend.com), отправитель `noreply@rovno.ai`.
- **DNS**: GoDaddy для `rovno.ai`, Reg.ru для `стройагент.рф`.
- ⚠️ Любые ваши действия здесь видны живым пользователям. Ошибки могут стоить лидов и доверия.

### Staging — `*.twc1.net` (URL приложения `rovno-staging`)

- **Frontend**: Timeweb Cloud Apps, приложение `rovno-staging`, ветка `dev`, Node 20.
- **Database / Auth**: **Supabase Cloud** (project ref `aaycwobhdkrrgfxwcfxg`, eu-west-1). Это **отдельная БД**, в ней моки и тестовые данные.
- **Email**: тот же Resend, но писем мало.
- ✅ Здесь можно ломать. Данные могут быть очищены без предупреждения.

### Local — `http://localhost:8080`

- `npm run dev` в репо `~/projects/rovno`.
- По умолчанию ходит в Cloud Supabase (через `VITE_SUPABASE_URL` в `.env`).
- Можно переключить на локальный Supabase docker stack из `~/projects/rovno-db` (`supabase start`), тогда поправить `.env`.

---

## Как понять, на каком окружении вы работаете

1. **Через env**: смотрите `VITE_SUPABASE_URL`.
   - `aaycwobhdkrrgfxwcfxg.supabase.co` → Cloud (staging / local default).
   - URL Timeweb VPS (например `api.rovno.ai` или прямой IP) → self-hosted prod.
2. **В UI приложения**: на staging должен быть жёлтый banner «STAGING — данные могут быть очищены». Если banner есть — это staging. На проде banner-а нет.
3. **Через консоль браузера**: при загрузке клиент Supabase логирует `Connected to: <URL>`.

Если не уверены, на каком окружении находитесь — **остановитесь и спросите пользователя**.

---

## Database & migrations

- Миграции живут в **`~/projects/rovno-db/supabase/migrations/`** (это отдельный репозиторий).
- Каждая миграция — SQL-файл с timestamp в имени. Только **append-only** изменения; уже применённые миграции редактировать **запрещено**.

### Workflow миграции

1. Создаёте новую миграцию: `supabase migration new <name>`.
2. Пишете SQL.
3. Применяете на **staging Cloud** первым: `supabase db push --linked` (с привязкой к Cloud project).
4. Проверяете, что schema на staging работает с фронтом.
5. Если ок — применяете на **prod self-hosted**: `psql $PROD_DATABASE_URL -f supabase/migrations/<file>.sql` (или через self-hosted CLI).
6. Коммитите файл миграции в репо `rovno-db`.

### Категорически запрещено

- ❌ Редактировать схему через **Supabase Studio UI** напрямую (на staging или prod). Все изменения только через файлы миграций.
- ❌ `pg_dump prod | psql staging` или наоборот — не лить данные между окружениями.
- ❌ `DROP TABLE`, `TRUNCATE`, `DELETE FROM ... WHERE true` без явного подтверждения пользователя на каждый раз. Даже на staging.

---

## Edge Functions

- Исходники в **`~/projects/rovno-db/supabase/functions/`**.
- Сейчас активны: `ai-inference`, `send-project-invite`.

### Деплой

Всегда указывайте **explicit `--project-ref`** или используйте обёртку:

```bash
# В staging (Cloud)
supabase functions deploy <name> --project-ref aaycwobhdkrrgfxwcfxg

# В prod (self-hosted) — через скрипт-обёртку
./scripts/deploy-prod-function.sh <name>
```

- ❌ Не деплойте функцию без явного `--project-ref` — supabase CLI может задеплоить в «последний linked» проект, и это может оказаться prod.
- Сначала всегда staging, потом prod.

---

## Email & Auth

- **Email шаблоны**: Supabase Dashboard → Authentication → Email Templates. Меняются вручную в UI обоих окружений (Cloud для staging, self-hosted для prod). Текущий шаблон Confirm signup использует `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (branded link).
- **SMTP**: Resend, API key в Supabase SMTP settings. Не показывайте API key в логах, чате, коммитах.
- **Redirect URLs**: список разрешённых редиректов в `Authentication → URL Configuration`. При добавлении нового домена — добавьте `https://newdomain/**` в whitelist обоих Supabase инстансов.

---

## Безопасные паттерны

- **Любые изменения** в код prod — только через PR в `dev`, потом merge `dev → main`.
- **Деструктивные операции** (миграции, удаление данных, force-push) — сначала `pg_dump` / git tag, потом операция.
- **Если запрос пользователя двусмысленный** — задайте уточняющий вопрос, не угадывайте.
- **Если видите подозрительные данные** (PII в логах, пароли в коммитах, странные SQL) — остановитесь и сообщите.
- **Не выходите за scope задачи**. Если вас просят добавить роут, не правьте Landing.tsx «заодно».

---

## Если поймали себя в опасной ситуации

- Сломали prod / unsure → **немедленно сообщите пользователю** с описанием что произошло и какие команды вы выполнили.
- Не пытайтесь чинить prod самостоятельно через `git revert`/force-push, если не уверены.
- В сложных случаях используйте `rovno-demo-playbook.md` (в `~/projects/`) — там сценарии rollback.

---

## Запрещённые команды без явного подтверждения

- `git push --force` (включая `--force-with-lease`) — кроме `feature/*`, `claude/*`, `codex/*` веток (свои собственные).
- `git push origin <локальная-ветка>:main` — никогда.
- `rm -rf` где угодно в репо.
- `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE`, `DELETE FROM` без `WHERE` — никогда.
- `supabase db reset` на привязанном к Cloud/prod проекте — никогда.
- Изменения в `package.json` `dependencies` / `devDependencies` без обсуждения.

---

**TL;DR**: feature-branch → PR в `dev` → проверка на staging → пользователь сам мерджит `dev → main` → автодеплой prod. Если сомневаетесь — спрашивайте.
