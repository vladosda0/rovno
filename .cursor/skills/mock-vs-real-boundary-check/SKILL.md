---
name: mock-vs-real-boundary-check
description: Determine whether a feature is mock/demo, real domain logic, or an integration seam, and preserve behavior intentionally. Use when touching home tabs with local data, settings/auth simulator flows, seed data or localStorage-driven behavior, persistence introductions in possibly mock areas, or documents/media/auth/storage seams.
---

# Mock vs Real Boundary Check

## Purpose

Avoid breaking demo surfaces or treating stub behavior as real persistence.

## Use when

- Touching home tabs with local data
- Touching settings or auth simulator flows
- Touching seed data or localStorage-driven behavior
- Introducing persistence into an area that may still be mock
- Wiring documents/media/auth/storage seams

## Instructions

1. Classify the target surface:
   - mock/demo
   - real domain logic
   - seam/integration layer
2. Identify current fallback behavior.
3. Decide whether the request is:
   - UI-only
   - seam-only
   - true persistence migration
4. Preserve existing fallback unless explicitly retiring it.
5. Return a clear boundary note.

## Output format

Return this exact structure:

```markdown
Surface classification: <mock/demo | real domain logic | seam/integration layer>
Current fallback behavior: <what currently keeps UX working when real path is unavailable>
Proposed change type: <UI-only | seam-only | true persistence migration>
What remains mock:
- <item>

What becomes real:
- <item>

Risks of hidden breakage:
- <risk>
```
