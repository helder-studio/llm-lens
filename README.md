<div align="center">

# @helder-studio/llm-lens

**See every LLM call your app makes, right on the device.**

Model, tokens, cost, time to first token, tool calls and errors for OpenAI, Anthropic and Gemini
requests, in a panel next to the UI that made them. React Native and web.

[![npm](https://img.shields.io/npm/v/@helder-studio/llm-lens?color=cb3837&logo=npm)](https://www.npmjs.com/package/@helder-studio/llm-lens)
[![bundle size](https://img.shields.io/bundlejs/size/@helder-studio/llm-lens?label=min%2Bgzip)](https://bundlejs.com/?q=@helder-studio/llm-lens)
[![CI](https://github.com/helder-studio/llm-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/helder-studio/llm-lens/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/npm-provenance-2ea44f?logo=sigstore)](https://www.npmjs.com/package/@helder-studio/llm-lens#provenance)
[![license](https://img.shields.io/npm/l/@helder-studio/llm-lens?color=blue)](./LICENSE)

<!-- demo GIF -->

</div>

```sh
npm install --save-dev @helder-studio/llm-lens
```

## Why

An AI feature that feels slow or expensive is hard to debug from the outside. Was it the model, a
huge prompt, a retry loop, a tool call that never ended? Server dashboards show it hours later and
far from the screen. LLM Lens shows each call the moment it happens, on the phone or in the browser
where you're testing.

## Quick start

```tsx
import { LlmLens } from '@helder-studio/llm-lens';

export default function Root() {
  return (
    <LlmLens enabled={__DEV__}>
      <App />
    </LlmLens>
  );
}
```

A 🤖 badge shows the running total (`3 calls · 4.2k tok · $0.0120`); tap it for the call list.

## Features

- 🔎 **Every call**: OpenAI Chat Completions and Responses, Anthropic Messages, Gemini
  `generateContent`, streamed or not, including the AI SDK and your own proxy if it keeps the API path
- 🪙 **Tokens and cost**: input, output and cache tokens from the provider's own `usage`, priced with
  built-in Claude prices or your own table
- ⏱️ **Latency that matters**: time to first token for streams, total duration, stop reason
- 🛠️ **Tool calls**: which tools the model asked for, per call
- 🙈 **Redaction**: turn previews off or mask them before they're stored
- 🧩 **Plays with the toolkit**: a dev-dock tab, and it shows the faults
  [network-chaos](https://github.com/helder-studio/network-chaos) injects
- 🚫 **Dev only**: `enabled={false}` records nothing, and `/noop` drops it from release bundles

## Options

```tsx
<LlmLens
  enabled={__DEV__}
  prices={{ 'gpt-5': { input: 1.25, output: 10 } }} // USD per 1M tokens, by model-id prefix
  capturePrompts={false} // no prompt / reply previews
  redact={(text) => text.replace(/\S+@\S+/g, '[email]')}
/>;
```

| Prop             | Type                                                         | Default            |
| ---------------- | ------------------------------------------------------------ | ------------------ |
| `enabled`        | `boolean`                                                    | required           |
| `prices`         | `Record<prefix, { input, output, cacheRead?, cacheWrite? }>` | Claude list prices |
| `capturePrompts` | `boolean`                                                    | `true`             |
| `redact`         | `(text) => string`                                           | none               |
| `badge`          | `boolean` (React Native)                                     | `true`             |

Built-in prices cover Claude models (Anthropic list prices as of 2026-10-06). Cache reads default to
0.1× and cache writes to 1.25× the input price. Costs are estimates; check your provider's bill.

## In code

```ts
import { llmLens } from '@helder-studio/llm-lens';

llmLens.install(); // record from the first line of your entry file
llmLens.getCalls(); // [{ model, usage, cost, ttftMs, durationMs, toolCalls, stopReason, … }]
llmLens.totals(); // { calls, input, output, cost, errors }
```

The parsers are exported too (`parseResponse`, `parseRequest`, `costOf`), handy in tests.

## With dev-dock and network-chaos

```tsx
import { DevDock } from '@helder-studio/dev-dock';
import { LlmLens, llmLensTab } from '@helder-studio/llm-lens';

<LlmLens enabled={qa} badge={false}>
  <App />
  <DevDock enabled={qa} tabs={[llmLensTab]} />
</LlmLens>;
```

Install network-chaos first and LLM Lens second to see the rate limits and dropped streams it fakes.

## Compared with other tools

[`@ai-sdk/devtools`](https://www.npmjs.com/package/@ai-sdk/devtools) inspects AI SDK calls on a
desktop. Langfuse and Helicone are server-side observability. LLM Lens runs inside the app, on any
provider's raw API calls, next to the screen you're testing.

## Support

If this saves you time, you can buy me a coffee on Ko-fi. It keeps the helder-studio libraries maintained.

<a href="https://ko-fi.com/gorian" target="_blank" rel="noopener">
  <img src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="Support me on Ko-fi" height="40">
</a>

## License

[MIT](./LICENSE) © [Helder Studio](https://www.helderstudio.com/en/)
