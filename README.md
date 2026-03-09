# Rovno

Rovno is an AI-powered construction operations workspace for projects, tasks, estimates, procurement, documents, approvals, and activity.

Status: this repository is the frontend/app workspace. It ships seeded demo and browser-local runtime flows today, with an incremental Supabase integration seam. Backend authority lives in the sibling `rovno-db` repository and is mirrored here as the read-only `backend-truth/` snapshot.

## Quickstart

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open the Vite app URL shown in the terminal. For most local work, the default `local` workspace source is enough.

## What Rovno Does

Rovno is built for construction project operators who need one workspace for planning, execution, approvals, and record keeping.

### Personas

- Owner / co-owner: manage projects, participants, approvals, and the overall operating flow.
- Contractor: execute work across tasks, procurement, HR, documents, and AI-assisted actions when access is enabled.
- Viewer / client: read-only visibility with a client-facing estimate approval flow when sharing is enabled.

### Implemented workflows

- Cross-project home workspace for overview, projects, tasks, documents, procurement, inventory, finance, and resources.
- Per-project dashboard with progress, budget, documents, gallery, participants, and quick actions.
- Task planning and execution across stages, checklists, comments, and media.
- Estimate v2 planning with works, resource lines, dependencies, scheduling, versioning, share links, and approval stamps.
- Procurement, supplier orders, receiving, inventory placement, and stock consumption.
- HR tracking for work items and payments.
- Project documents, media, activity feed, and notifications.
- AI sidebar flows for proposal generation, grouped review/apply, and photo consult.

### Current state

- `demo` and `local` flows are fully browser-backed and seeded from in-repo stores.
- `supabase` is available as an opt-in workspace source for project, member, and invite data when env config is present and the user has a session.
- The app is in a transitional state: richer domain logic is implemented in the frontend, while full backend integration is still being introduced incrementally.

## Demo Gallery

Seeded demo assets already live in this repository.

| Apartment demo | Office demo | Landscape demo |
| --- | --- | --- |
| ![Apartment demo](public/demo/apt-demo.png) | ![Office demo](public/demo/office-demo.png) | ![Landscape demo](public/demo/landscape-work-cover.png) |

## Architecture At A Glance

### Stack

- Vite 5
- React 18
- TypeScript 5
- Tailwind CSS
- shadcn/ui-style component layer on top of Radix UI primitives
- React Router
- React Query
- Vitest + Testing Library
- Supabase client for the backend integration seam

### Runtime modes

- `demo`: seeded session state for the demo experience.
- `local`: browser-local workspace state backed by in-memory stores and web storage.
- `supabase`: opt-in workspace source used only when `VITE_WORKSPACE_SOURCE=supabase`, Supabase env vars are present, and an authenticated session exists.

### Source-of-truth boundaries

- `src/pages/`: route surfaces and page-level behavior.
- `src/components/`: UI components, including domain-specific surfaces such as AI, dashboard, estimate-v2, procurement, tasks, and settings.
- `src/data/`: singleton stores, seeded data, and workspace/data-source adapters.
- `src/hooks/`: app-facing hooks that bridge pages/components to stores and workspace sources.
- `src/lib/`: domain logic such as AI proposal generation, permissions, estimate scheduling, procurement fulfillment, and auth state.
- `backend-truth/`: generated backend contract mirror from `rovno-db`. Read-only in this repo.
- `docs/`: architecture notes for deeper repo and app context.

### Roles and automation modes

Roles in the runtime model are `owner`, `co_owner`, `contractor`, and `viewer`.

Automation modes exposed in the app are:

- `manual`: user-controlled workflow with maximum oversight.
- `assisted`: AI suggests or groups actions and the user confirms them.
- `observer`: lower-autonomy insight/proactive mode; current UI labeling is still evolving across surfaces.
- `full`: highest-autonomy mode for AI-managed operational flow.

## Project Structure

```text
src/
  components/     UI and domain components
  data/           stores, seeds, adapters, read models
  hooks/          app-facing data hooks
  lib/            domain logic and helpers
  pages/          route surfaces
  integrations/   Supabase client and generated types
backend-truth/    generated backend contract mirror
docs/             architecture notes
public/demo/      seeded demo images
```

For deeper orientation, start with:

- [docs/app-architecture.md](docs/app-architecture.md)
- [docs/repo-architecture.md](docs/repo-architecture.md)

## Local Development

### Prerequisites

- Node.js 20
- npm

### Environment variables

Create a local env file from the checked-in template:

```sh
cp .env.example .env.local
```

Current config surface:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_WORKSPACE_SOURCE` | No | Selects the workspace source. Use `local` by default or `supabase` to opt into Supabase-backed workspace data. |
| `VITE_SUPABASE_URL` | Only for `supabase` mode | Supabase project URL used by the workspace source and Supabase client. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Only for `supabase` mode | Supabase publishable key used by the workspace source and Supabase client. |

### Scripts

All scripts below come directly from `package.json`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Produce a production build. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run TypeScript in no-emit mode. |
| `npm run test` | Run the Vitest suite once. |
| `npm run verify` | Run lint, typecheck, and tests in sequence. |

## Conventions For Contributors

- Keep diffs small and local to the requested behavior.
- Reuse existing shadcn/ui, Tailwind, store, hook, and route patterns before introducing anything new.
- Do not edit `backend-truth/` by hand. Backend contract changes belong in `rovno-db`.
- Preserve demo/local behavior unless the task explicitly changes it.
- Run `npm run verify` before opening a PR or asking for review.
- Do not change dependencies, scripts, or lockfiles unless the task explicitly requires it.
- For non-trivial behavior changes, add or adjust tests when feasible.

## CI

GitHub Actions runs the `CI` workflow on pushes and pull requests. The current pipeline installs dependencies, then runs:

- `npm run lint`
- `npm test`
- `npm run build`

## Security And Data Handling

- Do not commit secrets. Keep environment-specific values in local env files or platform-managed secrets.
- Treat project documents, media, and user/profile data as sensitive, even when working with demo or local flows.
- `backend-truth/` is generated and read-only; if the mirrored backend contract is wrong, fix it in `rovno-db` and regenerate.
- A formal security reporting process is not documented in this repository yet.

## License

This repository does not currently declare a license file.
