// @vitest-environment happy-dom
/// <reference lib="dom" />
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { llmLens } from '../lens';
import { LlmLens } from './LlmLens';
import { describeCall, formatCost, summary } from './shared';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  llmLens.uninstall();
  act(() => llmLens.clear());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('<LlmLens> (web)', () => {
  it('renders only children when disabled', () => {
    const el = document.createElement('div');
    act(() => createRoot(el).render(<LlmLens enabled={false}>app</LlmLens>));
    expect(el.textContent).toBe('app');
  });

  it('shows a live badge and a call list', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    document.body.append(el);
    act(() => createRoot(el).render(<LlmLens enabled />));
    const badge = () => el.querySelector('button');
    expect(badge()?.textContent).toBe('🤖 no LLM calls');
    act(() => {
      const handle = llmLens.start(
        'anthropic',
        'https://api.anthropic.com/v1/messages',
        '{"model":"claude-haiku-5-5"}',
      );
      handle.finish(
        200,
        JSON.stringify({ type: 'message', usage: { input_tokens: 1500, output_tokens: 500 } }),
      );
    });
    expect(badge()?.textContent).toBe('🤖 1 call · 2.0k tok · $0.0004');
    act(() => badge()?.click());
    expect(el.querySelector('section[aria-label="LLM calls"]')?.textContent).toContain(
      'claude-haiku-5-5',
    );
  });
});

describe('formatting', () => {
  it('summarises and describes calls', () => {
    expect(summary({ calls: 0, input: 0, output: 0, cost: 0, errors: 0 })).toBe('no LLM calls');
    expect(summary({ calls: 2, input: 12_000, output: 800, cost: 0.25, errors: 1 })).toBe(
      '2 calls · 13k tok · $0.25 · 1 failed',
    );
    expect(formatCost(undefined)).toBe('');
    expect(
      describeCall({
        id: 1,
        provider: 'openai',
        url: 'x',
        model: 'gpt-5',
        status: 429,
        startedAt: 0,
        ttftMs: 820,
        durationMs: 2300,
        streamed: true,
        toolCalls: ['search'],
        usage: { input: 1000, output: 200, cacheRead: 200, cacheWrite: 0 },
        pending: false,
      }),
    ).toBe('gpt-5 · HTTP 429 · 1.2k→200 · 820 ms TTFT · 2.3 s · tools: search');
  });
});
