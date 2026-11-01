# @helder-studio/llm-lens

Shared rules, commands and conventions: @AGENTS.md

Records LLM API calls inside the app (model, tokens, cost, TTFT, tool calls) and shows them in a
panel. React Native + web. Plan: workspace `docs/next-plan.md` §2.

## Layout

- `src/core/parse.ts`: provider detection (host, then path shape), `parseRequest`, `parseResponse`
  for OpenAI Chat Completions + Responses, Anthropic Messages, Gemini; JSON, SSE and Gemini JSON-array
  streams. `usage.input` always excludes cached tokens.
- `src/core/pricing.ts`: Claude list prices (from the claude-api skill, 2026-10-06), longest-prefix
  match. No OpenAI/Gemini defaults on purpose (unverified); users pass `prices`.
- `src/core/store.ts`: `createLens` (calls ring buffer 100, totals, previews capped at 280 chars).
- `src/intercept.ts`: fetch (web only; clones the response and reads the copy for TTFT) and XHR.
  Idempotent via `Symbol.for('helder-studio.llm-lens')`.
- Entries: `index` (web DOM panel), `native` (RN Modal, `LlmLensPanel`, `llmLensTab`), `noop`
  (parsers stay real).

## Open

Runaway-loop warning, Expo example with a real Claude call, device check.

## Commands

`pnpm verify`, `pnpm coverage`, `pnpm changeset`.
