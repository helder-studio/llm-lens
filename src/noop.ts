import type { ReactNode } from 'react';
import type { LlmLensController } from './lens';
import type { LlmLensProps } from './react/shared';

export type { ParsedRequest, ParsedResponse, Provider, Usage } from './core/parse';
export { parseRequest, parseResponse, providerOf } from './core/parse';
export { costOf, DEFAULT_PRICES, type Price, priceFor } from './core/pricing';
export type { LensOptions, LlmCall, Totals } from './core/store';
export type { LlmLensController } from './lens';
export type { LlmLensProps } from './react/shared';

const noop = () => {};
const handle = { firstByte: noop, finish: noop, fail: noop };

/**
 * Production stand-in that records nothing. Alias `@helder-studio/llm-lens` to
 * `@helder-studio/llm-lens/noop` in release builds; the parsers stay available.
 */
export const llmLens: LlmLensController = {
  getCalls: () => [],
  subscribe: () => noop,
  configure: noop,
  clear: noop,
  totals: () => ({ calls: 0, input: 0, output: 0, cost: 0, errors: 0 }),
  start: () => handle,
  install: noop,
  uninstall: noop,
};

export function LlmLens({ children }: LlmLensProps & { children?: ReactNode }): ReactNode {
  return children ?? null;
}

export function LlmLensPanel(): null {
  return null;
}

export const llmLensTab = {
  id: 'llm-lens',
  title: 'LLM',
  status: () => null,
  subscribe: () => noop,
  render: () => null,
};
