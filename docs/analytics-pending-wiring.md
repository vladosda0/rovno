# Pending analytics wiring

This file tracks `trackEvent` call sites that are declared in
`src/lib/analytics.ts` (via the `AnalyticsEventName` union) but not yet
wired in code, because the underlying product feature does not exist yet.

Wire each event the moment the feature lands in `dev`. The Yandex
Metrika goals are already created with these identifiers, so the goal
in the Metrika UI will start receiving hits as soon as the call sites
are added — no further config needed in Metrika.

| Event identifier | Metrika goal ID | Feature it depends on | Wire when |
| --- | --- | --- | --- |
| `estimate_constructor_opened` | 565791131 | Session 4 — `<EstimateConstructor>` Sheet/Drawer side panel triggered from a button inside `ProjectEstimate.tsx`. See `rovno-session-4-prompt.md` Phase 5. | Constructor lands in `dev` (target: 2026-06-06). Wire on the `onClick` of the trigger button, with payload `{ project_id, source: "estimate" | "shortcut" }`. |
| `ai_photo_analyzed` | 565791159 | AI photo analysis flow — user uploads an image and the model returns a structured response. Feature is being built. | Wire on the success branch of the photo analysis call. Payload should include `{ project_id, surface: "ai", duration_ms, model? }`. |
| `custom_catalog_created` | 565791538 | Custom resource catalogs in `/home?tab=documents&docTab=catalogs`. Currently `src/components/home/CatalogsTab.tsx` is just an empty-state placeholder — no creation UI yet. | Wire on the success branch of the "Create catalog" mutation once the creation flow exists. Payload: `{ catalog_id, item_count }`. |
| `custom_estimate_template_created` | 565791789 | User-authored estimate templates in `/home?tab=documents&docTab=estimates` (i.e. "save current estimate as template" or "build a template from scratch"). The current `DocumentTemplatesTab.tsx` only surfaces premade rovno.ai templates for download — no save-your-own flow yet. | Wire on the success branch of the create-template mutation. Payload: `{ template_id, source: "from_estimate" | "from_scratch", stage_count }`. |

## How to wire

Once a feature lands:

1. Find the place that confirms the action succeeded (mutation `onSuccess`,
   response handler, navigation step — whatever is the canonical "this
   really happened" moment).
2. Call `trackEvent("<identifier>", { ...payload })` from
   `@/lib/analytics`. The wrapper attaches `user_id` and `session_id`
   automatically — only domain-specific fields go in the payload.
3. Remove the corresponding row from this file.
4. Verify by performing the action in dev and checking that
   `[analytics] <identifier> {...}` appears in the browser console
   and a `mc.yandex.ru/watch/...` hit with the matching `goal-id`
   appears in Network.

## Why these are not wired yet

Wiring `trackEvent` calls that no UI can ever reach is dead code: it
clutters the analytics surface, can rot silently, and confuses anyone
reading the events list. Better to keep the type declaration (so the
Metrika goal lines up cleanly when the feature lands) and track the
pending work here.
