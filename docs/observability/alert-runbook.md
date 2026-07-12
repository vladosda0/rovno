# Alert runbook (observability v1, R-4 / R-9)

What each alert means, what to do when it fires, and how to keep alerts sane.
This is the "3am test" document — when the phone buzzes, read the matching
section, don't improvise.

## Design philosophy (do not weaken without discussing with Vlad)

- **Two P0 delivery paths only:** Telegram bot (primary), email (fallback via
  Sentry's own notification). Nothing else pages.
- **P1 is weekly, never paging.** The weekly digest (Sentry's scheduled report,
  see `setup.md`) is read on Monday, it does not interrupt.
- **Rate limit: max 3 Telegram alerts per 15 minutes.** Enforced in the
  `sentry-alert-telegram` relay via `observability_alert_log`; excess alerts
  are logged as `suppressed`, not delivered. This is the anti-fatigue backstop
  — if you find yourself wanting to raise it, the alert *rules* are too noisy,
  fix those instead.
- **Target: < 1 false-positive P0 per week.** If you get more than one useless
  page in a week, tune the triggering rule (thresholds below) before you start
  ignoring the channel. An ignored alert channel is worse than no channel.

Every alert message contains a direct Sentry link — always click through to
the issue before acting. The Telegram message is a summary, the Sentry issue
is the truth.

## Alerts

### A1 — "Prod health degraded" (error-rate spike)

- **Fires when:** prod error events in a 5-minute window exceed ~10× the
  7-day baseline (exact rule in `setup.md`).
- **Means:** something started failing for *many* users at once — a bad deploy,
  a backend/RPC outage, or an expired credential.
- **Do:**
  1. Open the Sentry issue from the link. Look at the top error group and its
     first-seen time.
  2. Correlate with the last deploy — Sentry `release` tag = git SHA. If the
     spike starts at a deploy, that's your suspect.
  3. If it's a frontend deploy: consider a Timeweb rollback (redeploy the
     previous commit). If backend: check Supabase edge-function logs / DB.
  4. If it's an expired secret (T-Bank, Resend, LLM provider), rotate it.
- **Stand down when:** the error rate returns to baseline for 15 minutes.

### A2 — "Critical RPC failure"

- **Fires when:** `apply_template_stage_to_estimate` **or**
  `search_canonical_library` produces 5xx / captured exceptions more than 3
  times in 5 minutes across different users.
- **Means:** a core estimate flow is broken (users literally cannot build an
  estimate). These are tagged in Sentry: frontend `tags.rpc` /
  `tags.query_key`, backend `tags.function_name`.
- **Do:**
  1. Open the issue; read the exception. A PostgREST message like
     `function … does not exist` or `permission denied` points at a migration
     / grant problem.
  2. Reproduce in staging with the same inputs if possible.
  3. If it's a migration drift, apply the fix cloud-first then prod (the
     standard `/deploy-migration` order).
- **Note:** single-user one-off RPC errors do **not** page (the "different
  users" + count condition filters them) — they show up in the weekly digest.

### A3 — "Full outage" (canary silence)

- **Fires when:** the external uptime canary (UptimeRobot, see `setup.md`)
  cannot reach the app for > 10 minutes, i.e. Sentry itself might be getting
  no events because nothing is running.
- **Means:** the site is down (Timeweb app dead, DNS, cert) — the case Sentry
  alone can't detect, because a dead app sends no error events.
- **Do:**
  1. Load rovno.ai yourself. If it's down, check the Timeweb dashboard
     (app status, latest deploy) and the VPS (`sstatus`).
  2. Check `api.rovno.ai` health — a dead DB/API looks like a dead site.
  3. Escalation path if the self-host stack is the problem is the
     docker-compose recovery in `rovno-db/infra` (see the PG17 override note).

## Muting / vacation mode (Open Question #8)

There is no in-app UI for this in v1. To go quiet:

- **Preferred:** in Sentry → Alerts, toggle the alert rules off (or set them
  to a snooze). This stops A1/A2 at the source and is reversible in two clicks.
- **Blunt:** mute the Telegram bot chat, or revoke `TELEGRAM_ALERT_CHAT_ID`.
  The relay keeps logging `sent`/`failed` in `observability_alert_log`, so you
  can see what you missed.
- **A3 canary:** pause the monitor in UptimeRobot.

Re-enable everything when back. (If muting becomes routine, that's the signal
to build the vacation-mode toggle — revisit with Vlad.)

## Weekly 30-minute ritual (R-9, success metric: ≥ 80% weeks completed)

Monday morning, bookmarkable dashboards (URLs in `setup.md`):

1. **Sentry issues, last 7 days, sorted by events** — triage the top 5. Assign
   each: fix now / backlog / ignore (mark resolved or ignored so it stops
   counting). ~10 min.
2. **Sentry weekly digest email** — skim new error types + any regressions
   (resolved issues that reappeared). ~5 min.
3. **Yandex Metrika funnels** (signup, activation, catalog, constructor) —
   note the biggest drop-off step. ~5 min.
4. **Yandex Metrika retention cohorts + DAU/WAU** — is the trend up or down vs
   last week? ~5 min.
5. **Feedback inbox** (`user_feedback` table via Studio, or the emails) — read
   what users wrote; anything actionable goes to the roadmap. ~5 min.

The point is one decision per surface, not deep analysis. If a surface is
empty/healthy, move on.
