import type { Usage } from './parse';

/** USD per million tokens. Cache prices default to 0.1× (read) and 1.25× (write) of input. */
export interface Price {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * Anthropic first-party list prices as of 2026-10-06. Keys are model-id prefixes; the longest
 * matching prefix wins. Other providers have no defaults: pass `prices` to `llmLens.configure()`.
 */
export const DEFAULT_PRICES: Record<string, Price> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  // Haiku 5.5: prompts up to 100K tokens (longer prompts cost more).
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export function priceFor(
  model: string | undefined,
  prices: Record<string, Price>,
): Price | undefined {
  if (!model) return undefined;
  let best: string | undefined;
  for (const key of Object.keys(prices)) {
    if (model.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? prices[best] : undefined;
}

/** Estimated cost in USD, or `undefined` when the model has no price. */
export function costOf(usage: Usage, price: Price | undefined): number | undefined {
  if (!price) return undefined;
  const cacheRead = price.cacheRead ?? price.input * 0.1;
  const cacheWrite = price.cacheWrite ?? price.input * 1.25;
  return (
    (usage.input * price.input +
      usage.output * price.output +
      usage.cacheRead * cacheRead +
      usage.cacheWrite * cacheWrite) /
    1_000_000
  );
}
