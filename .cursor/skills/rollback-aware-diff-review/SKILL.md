---
name: rollback-aware-diff-review
description: Reviews working-tree changes by intent, flags suspicious or unrelated files, and describes the safest rollback surface without executing Git rollback operations. Use when diffs are larger than expected, multiple domains are touched, commits are being prepared, or the user needs confidence that unrelated changes were not included.
---

# Rollback-Aware Diff Review

## Purpose
Keep changes human-reviewable and easy to unwind.

## Use When
- Diff is larger than expected.
- Multiple domains were touched.
- A commit is being prepared.
- The human needs confidence that unrelated changes were not changed.

## Instructions
1. Inspect changed files and group them by intent (feature, fix, refactor, test, docs, config, generated, etc.).
2. Flag files that appear unrelated, risky, or suspicious relative to the stated change intent.
3. Decide whether the diff should be split before commit.
4. Describe rollback surface clearly:
   - local unstaged only
   - local committed only
   - shared/pushed risk
5. Do not execute rollback commands unless explicitly requested by the human.

## Review Heuristics
- Treat cross-domain edits as suspicious unless the user intent requires them.
- Treat large generated/binary changes as high-attention review targets.
- Treat lockfiles, environment/config, and permission/auth-related edits as elevated risk.
- Prefer smallest reversible change slices.

## Output Format
Use this exact structure:

```markdown
## Change groups by intent
- [Group name]: [files]
- [Group name]: [files]

## Suspicious/unrelated files
- [file]: [why it may be unrelated or risky]
- [file]: [why it may be unrelated or risky]

## Should this be split?
- [Yes/No]
- [If yes, suggested split boundaries]

## Rollback surface
- Local unstaged only: [what is at risk]
- Local committed only: [what is at risk]
- Shared/pushed risk: [what is at risk]

## Human review focus points
- [most likely regression hotspot]
- [security/permissions/config hotspot]
- [data integrity or migration hotspot]
```
