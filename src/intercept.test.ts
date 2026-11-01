import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLens } from './core/store';
import { install, uninstall } from './intercept';

const anthropicBody = JSON.stringify({
  type: 'message',
  model: 'claude-sonnet-5-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: 'Hi Ada' }],
  usage: { input_tokens: 1000, output_tokens: 200 },
});

class FakeXhr extends EventTarget {
  status = 0;
  responseText = '';
  open() {}
  send() {
    setTimeout(() => {
      this.dispatchEvent(new Event('progress'));
      this.status = 200;
      this.responseText = anthropicBody;
      this.dispatchEvent(new Event('loadend'));
    }, 0);
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const realFetch = vi.fn();
let lens: ReturnType<typeof createLens>;

beforeEach(() => {
  realFetch.mockReset();
  vi.stubGlobal('fetch', realFetch);
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  let t = 0;
  lens = createLens(() => (t += 100));
  install(lens);
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
});

describe('fetch', () => {
  it('records an LLM call with usage, cost and previews, returning the untouched response', async () => {
    realFetch.mockResolvedValue(new Response(anthropicBody, { status: 200 }));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    expect((await res.json()).content[0].text).toBe('Hi Ada');
    await settle();
    const [call] = lens.getCalls();
    expect(call).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      status: 200,
      pending: false,
      prompt: 'Hello',
      response: 'Hi Ada',
      stopReason: 'end_turn',
      usage: { input: 1000, output: 200 },
    });
    // Sonnet 5.5: 1000 × $2/M + 200 × $10/M
    expect(call?.cost).toBeCloseTo(0.004);
    expect(lens.totals()).toMatchObject({ calls: 1, input: 1000, output: 200, errors: 0 });
  });

  it('measures time to first token on streams', async () => {
    const encoder = new TextEncoder();
    const events = [
      { type: 'message_start', message: { model: 'claude-haiku-5-5', usage: { input_tokens: 5 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Yo' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
    ];
    realFetch.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            for (const e of events) c.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
            c.close();
          },
        }),
      ),
    );
    await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: '{"stream":true}',
    });
    await vi.waitFor(() => expect(lens.getCalls()[0]?.pending).toBe(false));
    const [call] = lens.getCalls();
    expect(call).toMatchObject({ streamed: true, response: 'Yo', usage: { input: 5, output: 2 } });
    expect(call?.ttftMs).toBeGreaterThan(0);
  });

  it('ignores non-LLM traffic and records failures', async () => {
    realFetch.mockResolvedValue(new Response('ok'));
    await fetch('https://api.example.com/orders');
    expect(lens.getCalls()).toEqual([]);
    realFetch.mockRejectedValue(new TypeError('Network request failed'));
    await expect(fetch('https://api.openai.com/v1/chat/completions')).rejects.toThrow();
    expect(lens.getCalls()[0]).toMatchObject({ error: 'Network request failed', pending: false });
    expect(lens.totals().errors).toBe(1);
  });

  it('respects capturePrompts and redact', async () => {
    lens.configure({ capturePrompts: true, redact: (t) => t.replace(/Ada/g, '***') });
    realFetch.mockResolvedValue(new Response(anthropicBody));
    await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' });
    await settle();
    expect(lens.getCalls()[0]?.response).toBe('Hi ***');
    lens.configure({ capturePrompts: false });
    await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' });
    await settle();
    expect(lens.getCalls()[0]?.response).toBe(undefined);
  });
});

describe('XMLHttpRequest', () => {
  it('records calls made through XHR', async () => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.anthropic.com/v1/messages');
    xhr.send('{"model":"claude-sonnet-5-5"}');
    await settle();
    await settle();
    expect(lens.getCalls()[0]).toMatchObject({
      status: 200,
      response: 'Hi Ada',
      usage: { output: 200 },
    });
  });
});

describe('install', () => {
  it('is idempotent, restores originals, and skips fetch on React Native', () => {
    const patched = globalThis.fetch;
    install(lens);
    expect(globalThis.fetch).toBe(patched);
    uninstall();
    expect(globalThis.fetch).toBe(realFetch);
    vi.stubGlobal('navigator', { product: 'ReactNative' });
    install(lens);
    expect(globalThis.fetch).toBe(realFetch);
  });
});
