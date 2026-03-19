---
name: sensitive-zone-audit
description: Audits cross-domain side effects across estimate, tasks, procurement, HR, AI sidebar, and sync hotspots before changes. Use when editing estimate-v2 logic/UI, procurement/order/inventory flows, task/checklist linkage, HR sync/lineage, AI proposal commit paths, or shared store/cross-domain sync helpers.
---

# Sensitive Zone Audit

## Purpose

Protect the launch-critical Rovno loop:
Estimate -> Tasks -> Procurement -> HR

## Use When

- Editing estimate-v2 logic or UI
- Editing procurement/order/inventory flows
- Editing task/checklist linkage
- Editing HR sync or lineage
- Editing AI proposal commit paths
- Editing shared store or cross-domain sync helpers

## Instructions

1. Identify the primary owner of the behavior.
2. Trace side effects into adjacent domains.
3. Check for:
   - lineage fields
   - status transitions
   - materialization logic
   - derived totals/rollups
   - event/activity writes
   - legacy/v2 overlap
4. List exact regression risks.
5. Recommend the smallest safe edit approach.

## Output Format

- Primary owner
- Side-effect map
- Legacy/v2 overlap
- Regression risks
- Minimal safe approach
- Required regression checks

## Hard Rules

- No casual rewrites of orchestration logic.
- No assumption that UI labels match domain truth.
