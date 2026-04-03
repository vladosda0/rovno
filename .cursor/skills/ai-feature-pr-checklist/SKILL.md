---
name: ai-feature-pr-checklist
description: >-
  Checklist for AI-related UI and API changes: permissions, failure states, logging, injection, cost/latency hints. Use when editing AISidebar, commit proposals, prompts, tool wiring, or model-backed flows in rovno.
---

# AI feature PR checklist

## Permissions and trust

- Does every **tool or mutation** path check the same auth/role rules as the non-AI flow?
- Is it obvious to the user **when the AI acted** vs deterministic code?

## Data and prompts

- Are prompts built from **minimal necessary** context?
- Is **user-generated text** escaped or isolated so it cannot hijack system instructions?

## Failure and empty states

- Timeout, API error, empty completion: does the UI recover without losing data?
- Are errors **user-safe** (no stack traces or secrets)?

## Observability (lightweight)

- Is there enough logging for the team to debug (without raw PII dumps)?
- Any **rate limit** or **cost** note for the user if usage spikes?

## Manual tests (suggest 3–5)

- Denied permission path
- Network failure / slow model
- Malicious-looking user input in a field that feeds the model
- Happy path completion

Finish with **ship recommendation** and gaps.
