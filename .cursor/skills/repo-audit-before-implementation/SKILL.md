---
name: repo-audit-before-implementation
description: Audits current implementation before editing for non-trivial requests, unclear architecture, or multi-file impact. Use when behavior is described at product level, code reality is not yet confirmed, or multiple stores/flows may be involved.
---

# Repo Audit Before Implementation

## Purpose

Convert user intent into repo-grounded implementation reality before any edits happen.

## Use when

- The task is larger than a small local fix.
- The current implementation is not already known.
- Multiple files, stores, or flows may be involved.
- The request sounds like product behavior, not confirmed code reality.

## Instructions

1. Confirm the repo and working slice from the codebase itself.
2. Inspect only the minimal relevant files first:
   - page/route entry
   - domain store(s)
   - helper/read-model/sync files
   - related tests if they exist
3. Determine:
   - current behavior
   - canonical data/model owner
   - legacy/v2 overlap
   - smallest safe change set
   - major regression risks
4. Do not edit during this skill.
5. Return a compact audit report.

## Output format

- Goal as understood
- Relevant files
- Current behavior
- Canonical model/owner
- Risks and ambiguities
- Proposed minimal change set
- Verification plan
- Stop conditions / unknowns

## Hard rules

- No edits.
- No invented file paths.
- No backend assumptions from UI code.
