import { type Provider, parseRequest, parseResponse, type Usage } from './parse';
import { costOf, DEFAULT_PRICES, type Price, priceFor } from './pricing';

export interface LlmCall {
  id: number;
  provider: Provider;
  url: string;
  model?: string | undefined;
  status?: number;
  startedAt: number;
  /** ms from start to the first response byte (streaming responses only). */
  ttftMs?: number | undefined;
  durationMs?: number;
  streamed: boolean;
  usage?: Usage;
  /** Estimated USD; `undefined` when the model has no price. */
  cost?: number | undefined;
  stopReason?: string | undefined;
  toolCalls: string[];
  /** Previews, empty when `capturePrompts` is off. */
  prompt?: string | undefined;
  response?: string | undefined;
  error?: string | undefined;
  pending: boolean;
}

export interface LensOptions {
  /** Prices per model-id prefix, merged over the built-in Claude prices. */
  prices?: Record<string, Price>;
  /** Keep prompt and response previews. Default true (dev builds only). */
  capturePrompts?: boolean;
  /** Rewrite previews before they're stored, e.g. to mask emails. */
  redact?: (text: string) => string;
}

export interface Totals {
  calls: number;
  input: number;
  output: number;
  cost: number;
  errors: number;
}

const MAX_CALLS = 100;
const PREVIEW = 280;

export function createLens(now: () => number = Date.now) {
  let calls: LlmCall[] = [];
  let nextId = 1;
  let prices: Record<string, Price> = DEFAULT_PRICES;
  let capturePrompts = true;
  let redact = (text: string) => text;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const update = (id: number, patch: Partial<LlmCall>) => {
    calls = calls.map((c) => (c.id === id ? { ...c, ...patch } : c));
    emit();
  };
  const preview = (text: string | undefined) =>
    capturePrompts && text ? redact(text).slice(0, PREVIEW) : undefined;

  return {
    getCalls: () => calls,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    configure(options: LensOptions) {
      if (options.prices) prices = { ...DEFAULT_PRICES, ...options.prices };
      if (options.capturePrompts !== undefined) capturePrompts = options.capturePrompts;
      if (options.redact) redact = options.redact;
    },
    clear() {
      calls = [];
      emit();
    },
    totals(): Totals {
      const done = calls.filter((c) => !c.pending);
      return {
        calls: calls.length,
        input: done.reduce(
          (n, c) => n + (c.usage ? c.usage.input + c.usage.cacheRead + c.usage.cacheWrite : 0),
          0,
        ),
        output: done.reduce((n, c) => n + (c.usage?.output ?? 0), 0),
        cost: done.reduce((n, c) => n + (c.cost ?? 0), 0),
        errors: done.filter((c) => c.error || (c.status ?? 200) >= 400).length,
      };
    },

    /** Called by the interceptors when an LLM request starts. */
    start(provider: Provider, url: string, requestBody: string | undefined) {
      const request = parseRequest(requestBody);
      const startedAt = now();
      const call: LlmCall = {
        id: nextId++,
        provider,
        url,
        ...(request.model && { model: request.model }),
        startedAt,
        streamed: request.stream,
        toolCalls: [],
        ...(preview(request.prompt) && { prompt: preview(request.prompt) }),
        pending: true,
      };
      calls = [call, ...calls].slice(0, MAX_CALLS);
      emit();
      let firstByte: number | undefined;
      return {
        firstByte() {
          if (firstByte === undefined) firstByte = now();
        },
        finish(status: number, responseBody: string) {
          const res = parseResponse(provider, responseBody);
          const model = res.model ?? call.model;
          const end = now();
          update(call.id, {
            ...(model && { model }),
            status,
            durationMs: end - startedAt,
            ...(firstByte !== undefined && res.streamed && { ttftMs: firstByte - startedAt }),
            streamed: res.streamed,
            ...(res.usage && { usage: res.usage }),
            ...(res.usage &&
              costOf(res.usage, priceFor(model, prices)) !== undefined && {
                cost: costOf(res.usage, priceFor(model, prices)),
              }),
            ...(res.stopReason && { stopReason: res.stopReason }),
            toolCalls: res.toolCalls,
            ...(preview(res.text) && { response: preview(res.text) }),
            ...(res.error && { error: res.error }),
            pending: false,
          });
        },
        fail(message: string) {
          update(call.id, { error: message, durationMs: now() - startedAt, pending: false });
        },
      };
    },
  };
}

export type Lens = ReturnType<typeof createLens>;
