---
name: implementation-contract
description: Convert an approved audit into a tight edit contract with scope, constraints, acceptance criteria, verification, and rollback notes. Use when repo reality has been audited, the task is ready to move into implementation, and the change is larger than a tiny local fix.
---

# Implementation Contract

## Purpose
Create a precise execution contract before code changes begin.

## Use when
- Repo reality has been audited.
- The task is ready to move into implementation.
- The change touches more than a tiny local fix.

## Instructions
Produce a compact implementation contract with exactly these headings, in this order:
- Goal
- Current behavior
- Desired behavior
- Constraints
- Files/scope
- Acceptance criteria
- Verification
- Rollback notes

Rules:
- Keep file scope narrow.
- Prefer existing architecture.
- Mention any sensitive-zone impacts.
- Do not include speculative files.

## Output template
Use this template exactly:

```markdown
## Goal
[Single outcome-focused statement of what will be delivered.]

## Current behavior
- [Observed behavior in repo today.]
- [Any confirmed constraints from current implementation.]

## Desired behavior
- [Concrete behavior after changes.]
- [What should remain unchanged.]

## Constraints
- [Technical and product constraints.]
- [Architecture reuse requirements.]
- [Sensitive-zone impacts, if any.]

## Files/scope
- In scope:
  - `[path/to/file]`: [why needed]
  - `[path/to/file]`: [why needed]
- Out of scope:
  - `[path/to/file or area]`: [why explicitly excluded]

## Acceptance criteria
- [ ] [Testable criterion tied to behavior.]
- [ ] [Testable criterion tied to scope boundaries.]
- [ ] [Testable criterion tied to non-regression.]

## Verification
- [Exact checks to run; prefer targeted checks first.]
- [What will be manually validated in UI or flow.]
- [Known items not verified yet, if any.]

## Rollback notes
- [Minimal rollback approach if behavior regresses.]
- [What to revert first and why.]
- [Any data or migration caveats, if relevant.]
```

## Quality checks
- Keep output compact and concrete.
- Avoid speculative architecture or future cleanup work.
- Include only files confirmed by audit evidence.
- Ensure acceptance criteria are verifiable and binary.
