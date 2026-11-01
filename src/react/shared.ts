import { useEffect, useSyncExternalStore } from 'react';
import type { LensOptions, LlmCall, Totals } from '../core/store';
import { llmLens } from '../lens';

export interface LlmLensProps extends LensOptions {
  /** Off: nothing is recorded and nothing renders. Pass something like `__DEV__`. */
  enabled: boolean;
  /** React Native: `false` hides the built-in badge and panel, e.g. when using dev-dock. */
  badge?: boolean;
}

let warned = false;

/** Installs during render so calls fired by children's effects are recorded. */
export function useActivation({ enabled, prices, capturePrompts, redact }: LlmLensProps) {
  if (enabled) llmLens.install();
  useEffect(() => {
    if (!enabled) return;
    llmLens.configure({
      ...(prices && { prices }),
      ...(capturePrompts !== undefined && { capturePrompts }),
      ...(redact && { redact }),
    });
    if (!warned) {
      warned = true;
      console.warn('[llm-lens] recording LLM calls (dev only).');
    }
  }, [enabled, prices, capturePrompts, redact]);
}

export function useCalls(): LlmCall[] {
  return useSyncExternalStore(llmLens.subscribe, llmLens.getCalls, llmLens.getCalls);
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return '';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

/** Badge text, e.g. `3 calls · 4.2k tok · $0.0120`. */
export function summary(totals: Totals): string {
  if (!totals.calls) return 'no LLM calls';
  const parts = [`${totals.calls} call${totals.calls === 1 ? '' : 's'}`];
  parts.push(`${formatTokens(totals.input + totals.output)} tok`);
  if (totals.cost) parts.push(formatCost(totals.cost));
  if (totals.errors) parts.push(`${totals.errors} failed`);
  return parts.join(' · ');
}

/** One-line description of a call, e.g. `claude-sonnet-5-5 · 1.2k→340 · 820 ms TTFT`. */
export function describeCall(call: LlmCall): string {
  const parts = [call.model ?? call.provider];
  if (call.pending) parts.push('…');
  if (call.status && call.status >= 400) parts.push(`HTTP ${call.status}`);
  if (call.usage) {
    const input = call.usage.input + call.usage.cacheRead + call.usage.cacheWrite;
    parts.push(`${formatTokens(input)}→${formatTokens(call.usage.output)}`);
  }
  if (call.cost !== undefined) parts.push(formatCost(call.cost));
  if (call.ttftMs !== undefined) parts.push(`${call.ttftMs} ms TTFT`);
  if (call.durationMs !== undefined) parts.push(`${(call.durationMs / 1000).toFixed(1)} s`);
  if (call.toolCalls.length) parts.push(`tools: ${call.toolCalls.join(', ')}`);
  return parts.join(' · ');
}
