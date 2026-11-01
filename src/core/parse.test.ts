import { describe, expect, it } from 'vitest';
import { parseRequest, parseResponse, providerOf } from './parse';
import { costOf, DEFAULT_PRICES, priceFor } from './pricing';

const sse = (...events: unknown[]) =>
  events.map((e) => (typeof e === 'string' ? e : `data: ${JSON.stringify(e)}`)).join('\n\n');

describe('providerOf', () => {
  it.each([
    ['https://api.anthropic.com/v1/messages', 'anthropic'],
    ['https://api.openai.com/v1/chat/completions', 'openai'],
    ['https://api.openai.com/v1/responses', 'openai'],
    ['https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', 'gemini'],
    ['https://proxy.dev/v1/messages', 'anthropic'],
    ['https://proxy.dev/api/orders', undefined],
  ])('%s', (url, provider) => expect(providerOf(url)).toBe(provider));
});

describe('parseRequest', () => {
  it('reads model, stream flag, last user message and tool count', () => {
    const body = JSON.stringify({
      model: 'claude-sonnet-5-5',
      stream: true,
      tools: [{ name: 'a' }, { name: 'b' }],
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: [{ type: 'text', text: 'Plan my trip' }] },
      ],
    });
    expect(parseRequest(body)).toEqual({
      model: 'claude-sonnet-5-5',
      stream: true,
      prompt: 'Plan my trip',
      tools: 2,
    });
  });

  it('handles Gemini contents, Responses API input and junk', () => {
    expect(
      parseRequest(JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }))
        .prompt,
    ).toBe('hi');
    expect(parseRequest(JSON.stringify({ model: 'gpt-x', input: 'hello' })).prompt).toBe('hello');
    expect(parseRequest('not json')).toEqual({ stream: false, tools: 0 });
    expect(parseRequest(undefined)).toEqual({ stream: false, tools: 0 });
  });
});

describe('parseResponse: Anthropic', () => {
  it('reads a Messages API response', () => {
    const body = JSON.stringify({
      type: 'message',
      model: 'claude-opus-5-5',
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Checking the weather.' },
        { type: 'tool_use', name: 'get_weather', input: {} },
      ],
      usage: {
        input_tokens: 120,
        output_tokens: 40,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 0,
      },
    });
    expect(parseResponse('anthropic', body)).toEqual({
      model: 'claude-opus-5-5',
      stopReason: 'tool_use',
      text: 'Checking the weather.',
      toolCalls: ['get_weather'],
      streamed: false,
      usage: { input: 120, output: 40, cacheRead: 1000, cacheWrite: 0 },
    });
  });

  it('reads an SSE stream', () => {
    const body = sse(
      'event: message_start',
      {
        type: 'message_start',
        message: { model: 'claude-haiku-5-5', usage: { input_tokens: 50, output_tokens: 1 } },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } },
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', name: 'search' },
      },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 25 } },
      { type: 'message_stop' },
    );
    expect(parseResponse('anthropic', body)).toMatchObject({
      model: 'claude-haiku-5-5',
      text: 'Hello',
      toolCalls: ['search'],
      stopReason: 'end_turn',
      streamed: true,
      usage: { input: 50, output: 25, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it('reads provider errors', () => {
    const body = JSON.stringify({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    });
    expect(parseResponse('anthropic', body).error).toBe('Overloaded');
  });
});

describe('parseResponse: OpenAI', () => {
  it('reads a Chat Completions response with cached tokens', () => {
    const body = JSON.stringify({
      model: 'gpt-5',
      choices: [
        {
          finish_reason: 'tool_calls',
          message: { content: 'Sure', tool_calls: [{ function: { name: 'lookup' } }] },
        },
      ],
      usage: {
        prompt_tokens: 500,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 400 },
      },
    });
    expect(parseResponse('openai', body)).toMatchObject({
      model: 'gpt-5',
      text: 'Sure',
      toolCalls: ['lookup'],
      stopReason: 'tool_calls',
      usage: { input: 100, output: 20, cacheRead: 400, cacheWrite: 0 },
    });
  });

  it('reads a streamed Chat Completions response with a broken event and [DONE]', () => {
    const body = sse(
      { model: 'gpt-5', choices: [{ delta: { content: 'Hi' } }] },
      'data: {"broken',
      { model: 'gpt-5', choices: [{ delta: { content: ' there' }, finish_reason: 'stop' }] },
      { model: 'gpt-5', choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } },
      'data: [DONE]',
    );
    expect(parseResponse('openai', body)).toMatchObject({
      text: 'Hi there',
      stopReason: 'stop',
      streamed: true,
      usage: { input: 10, output: 3 },
    });
  });

  it('reads the Responses API, plain and streamed', () => {
    const response = {
      object: 'response',
      model: 'gpt-5',
      status: 'completed',
      output: [
        { type: 'function_call', name: 'calc' },
        { type: 'message', content: [{ type: 'output_text', text: 'Done' }] },
      ],
      usage: { input_tokens: 30, output_tokens: 7, input_tokens_details: { cached_tokens: 10 } },
    };
    expect(parseResponse('openai', JSON.stringify(response))).toMatchObject({
      text: 'Done',
      toolCalls: ['calc'],
      stopReason: 'completed',
      usage: { input: 20, output: 7, cacheRead: 10 },
    });
    const streamed = sse(
      { type: 'response.output_text.delta', delta: 'Do' },
      { type: 'response.output_text.delta', delta: 'ne' },
      { type: 'response.completed', response },
    );
    expect(parseResponse('openai', streamed)).toMatchObject({
      text: 'Done',
      streamed: true,
      usage: { output: 7 },
    });
  });
});

describe('parseResponse: Gemini', () => {
  const chunk = (text: string, extra = {}) => ({
    modelVersion: 'gemini-x',
    candidates: [{ content: { parts: [{ text }] }, ...extra }],
  });

  it('reads SSE and JSON-array streams', () => {
    const last = {
      ...chunk('!', { finishReason: 'STOP' }),
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, cachedContentTokenCount: 2 },
    };
    const expected = {
      model: 'gemini-x',
      text: 'Hi!',
      stopReason: 'STOP',
      usage: { input: 10, output: 4, cacheRead: 2 },
    };
    expect(parseResponse('gemini', sse(chunk('Hi'), last))).toMatchObject(expected);
    expect(parseResponse('gemini', JSON.stringify([chunk('Hi'), last]))).toMatchObject({
      ...expected,
      streamed: true,
    });
  });

  it('reads function calls', () => {
    const body = JSON.stringify({
      candidates: [{ content: { parts: [{ functionCall: { name: 'book' } }] } }],
    });
    expect(parseResponse('gemini', body).toolCalls).toEqual(['book']);
  });
});

describe('pricing', () => {
  it('picks the longest matching model prefix', () => {
    expect(priceFor('claude-opus-5-5', DEFAULT_PRICES)?.input).toBe(4);
    expect(priceFor('claude-opus-5', DEFAULT_PRICES)?.input).toBe(5);
    expect(priceFor('gpt-5', DEFAULT_PRICES)).toBe(undefined);
    expect(priceFor(undefined, DEFAULT_PRICES)).toBe(undefined);
  });

  it('costs input, output and cache tokens', () => {
    const usage = {
      input: 1_000_000,
      output: 100_000,
      cacheRead: 1_000_000,
      cacheWrite: 1_000_000,
    };
    // Sonnet 5.5: $2 in, $10 out, $0.20 cache read, cache write defaults to 1.25 × input.
    expect(costOf(usage, DEFAULT_PRICES['claude-sonnet-5-5'])).toBeCloseTo(2 + 1 + 0.2 + 2.5);
    expect(costOf(usage, { input: 1, output: 1 })).toBeCloseTo(1 + 0.1 + 0.1 + 1.25);
    expect(costOf(usage, undefined)).toBe(undefined);
  });
});
