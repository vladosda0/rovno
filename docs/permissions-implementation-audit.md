# Permissions implementation audit

Contract compliance review against:

- `/Users/vladislavgorlov/Desktop/perm-contract.json` (execution contract)
- `/Users/vladislavgorlov/Desktop/phase 6/Permissions.md` (normative context)

Repositories: `rovno` (`/Users/vladislavgorlov/projects/rovno`), `rovno-db` (`/Users/vladislavgorlov/projects/rovno-db`).

Machine-readable findings: `docs/permissions-implementation-audit.json`.

## Executive counts

| Status | Count |
|--------|------:|
| implemented_fullstack | 2 |
| implemented_backend_only | 1 |
| implemented_frontend_only | 0 |
| partial_match | 8 |
| semantic_mismatch | 12 |
| missing | 1 |
| blocked_by_backend_contract | 2 |
| unclear_needs_manual_review | 2 |

## Critical findings (ranked)

1. **HR domain vs contract** — Contract: viewer/contractor `domain_access: hidden`. Code: `getProjectDomainAccessForRole` returns `view` for `hr`; `get_hr_operational_summary` is callable for any project member and returns HR rows including `compensation_type`. Violates `hidden_means_hidden` and HR hidden rules.
2. **Estimate summary money model** — Contract: table `summary` shows client unit/total/discounted client fields. `get_estimate_operational_summary` only populates client price fields when `effective_finance_visibility = detail`, so summary-tier members cannot receive contract-backed client amounts via the operational RPC path.
3. **Estimate export** — Contract: viewer/contractor `export_csv: hidden`. UI always offers export when workspace is shown; CSV path can still emit tax/total lines even when operational-only branches are used.
4. **Procurement tabs** — Contract: viewer/contractor see requested + ordered + in stock. UI limits non-manage users to ordered + in_stock only (`visibleTabs` in `ProjectProcurement.tsx`).
5. **Procurement supplier (viewer)** — Contract: hide `supplier_name` on ordered tab for viewer. UI shows `order.supplierName` in the order header for all users when present.
6. **AI enforcement** — No repo-local proof that all AI surfaces inherit the user permission envelope; `ContextInspector` packs cross-domain summaries without a documented parity check to contract `ai_enforcement`.

## Findings by contract path

See `findings[]` in `permissions-implementation-audit.json` for each item:

- `contract_path`
- `intended_behavior` / `backend_support` / `frontend_support` / `observed_behavior`
- `status`, `severity`, `phase_bucket`, `repo_owner`
- `evidence` (file paths)
- `required_follow_up`

## Suggested execution order

1. Close HR leakage end-to-end (frontend domain map + RPC eligibility + field redaction).
2. Fix estimate operational read model for **summary** financial visibility (client-safe totals without internal cost leakage).
3. Gate estimate export and strip monetary rows per role + `financial_visibility`.
4. Procurement: restore requested tab for summary roles; hide supplier for viewer; add `disabled_visible` action pattern for contractor.
5. Documents/media labeling + internal_docs seam regeneration; activity payload review; AI tool audit.
