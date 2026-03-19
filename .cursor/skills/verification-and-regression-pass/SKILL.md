---
name: verification-and-regression-pass
description: Run targeted verification, review the diff, and report confidence level plus remaining risk before handoff. Use when implementation is complete, a diff exists, and work is ready for human review.
---

# Verification and Regression Pass

## Purpose
Make the agent prove the change, not just claim it.

## Use when
- Implementation is complete.
- A diff exists.
- The work is ready for human review.

## Instructions
1. Run the smallest relevant checks available.
2. Review changed files for unrelated edits.
3. Check nearby flows that are most likely to regress.
4. Report:
   - what passed
   - what was not run
   - what remains uncertain
5. Keep the report practical and specific.

## Output format
Use this structure:

- Files changed
- Checks run
- Results
- Nearby regressions checked
- Unverified risk
- Confidence assessment

## Hard rules
- Do not say "done" without stating what was actually verified.
