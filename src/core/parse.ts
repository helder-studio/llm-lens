export type Provider = 'openai' | 'anthropic' | 'gemini';

const HOSTS: Record<string, Provider> = {
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'generativelanguage.googleapis.com': 'gemini',
};

/** API path shapes, so self-hosted proxies that keep them are detected too. */
const PATHS: [RegExp, Provider][] = [
  [/\/v1\/messages\b/, 'anthropic'],
  [/:(stream)?generateContent\b/i, 'gemini'],
  [/\/(chat\/)?completions\b|\/v1\/responses\b/, 'openai'],
];

const ORIGIN = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i;

export function providerOf(url: string): Provider | undefined {
  const host = (ORIGIN.exec(url)?.[1] ?? '').replace(/:\d+$/, '').toLowerCase();
  if (HOSTS[host]) return HOSTS[host];
  const path = url.replace(ORIGIN, '');
  return PATHS.find(([re]) => re.test(path))?.[1];
}

/** Normalised token counts: `input` excludes cached tokens on every provider. */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ParsedRequest {
  model?: string;
  stream: boolean;
  /** Text of the last user message. */
  prompt?: string;
  tools: number;
}

export interface ParsedResponse {
  model?: string | undefined;
  usage?: Usage;
  stopReason?: string | undefined;
  text: string;
  toolCalls: string[];
  /** The body was an SSE stream. */
  streamed: boolean;
  /** Provider error message for non-2xx responses. */
  error?: string | undefined;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return arr(content)
    .map((part) => str(obj(part).text) ?? '')
    .filter(Boolean)
    .join(' ');
}

export function parseRequest(body: string | undefined): ParsedRequest {
  let json: Json = {};
  try {
    json = obj(body ? JSON.parse(body) : undefined);
  } catch {
    // Not JSON: nothing to read.
  }
  // OpenAI chat / Anthropic: messages; Responses API: input; Gemini: contents.
  const turns = arr(json.messages ?? json.contents ?? json.input);
  const lastUser = [...turns].reverse().find((t) => obj(t).role === 'user');
  const prompt =
    typeof json.input === 'string'
      ? json.input
      : lastUser
        ? textOf(obj(lastUser).content ?? obj(lastUser).parts)
        : undefined;
  const model = str(json.model);
  return {
    ...(model && { model }),
    stream: json.stream === true,
    ...(prompt && { prompt }),
    tools: arr(json.tools).length,
  };
}

/** JSON objects in a body: one for plain JSON, one per `data:` line for SSE. */
function events(body: string): { items: Json[]; streamed: boolean } {
  const trimmed = body.trim();
  if (!trimmed) return { items: [], streamed: false };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      // Gemini's non-SSE streaming endpoint returns a JSON array of chunks.
      return {
        items: Array.isArray(parsed) ? parsed.map(obj) : [obj(parsed)],
        streamed: Array.isArray(parsed),
      };
    } catch {
      // Fall through: maybe a stream that starts with JSON-looking text.
    }
  }
  const items: Json[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      items.push(obj(JSON.parse(data)));
    } catch {
      // A broken event (e.g. network-chaos "malformed"): skip it.
    }
  }
  return { items, streamed: true };
}

export function parseResponse(provider: Provider, body: string): ParsedResponse {
  const { items, streamed } = events(body);
  const out: ParsedResponse = { text: '', toolCalls: [], streamed };
  let usage: Usage | undefined;
  const setUsage = (patch: Partial<Usage>) => {
    usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ...usage, ...patch };
  };

  for (const item of items) {
    const error = obj(item.error);
    if (str(error.message)) out.error = str(error.message);

    if (provider === 'anthropic') {
      const message = obj(
        item.type === 'message_start' ? item.message : item.type === 'message' ? item : {},
      );
      if (str(message.model)) out.model = str(message.model);
      const u = obj(message.usage ?? (item.type === 'message_delta' ? item.usage : undefined));
      if (Object.keys(u).length) {
        setUsage({
          ...(u.input_tokens !== undefined && { input: num(u.input_tokens) }),
          ...(u.output_tokens !== undefined && { output: num(u.output_tokens) }),
          ...(u.cache_read_input_tokens !== undefined && {
            cacheRead: num(u.cache_read_input_tokens),
          }),
          ...(u.cache_creation_input_tokens !== undefined && {
            cacheWrite: num(u.cache_creation_input_tokens),
          }),
        });
      }
      const stop = str(message.stop_reason) ?? str(obj(item.delta).stop_reason);
      if (stop) out.stopReason = stop;
      for (const block of [...arr(message.content), obj(item.content_block)]) {
        const b = obj(block);
        if (b.type === 'text' && str(b.text)) out.text += b.text;
        if (b.type === 'tool_use' && str(b.name)) out.toolCalls.push(b.name as string);
      }
      const delta = obj(item.delta);
      if (delta.type === 'text_delta' && str(delta.text)) out.text += delta.text;
    } else if (provider === 'gemini') {
      if (str(item.modelVersion)) out.model = str(item.modelVersion);
      const candidate = obj(arr(item.candidates)[0]);
      for (const part of arr(obj(candidate.content).parts)) {
        const p = obj(part);
        if (str(p.text)) out.text += p.text;
        const call = str(obj(p.functionCall).name);
        if (call) out.toolCalls.push(call);
      }
      if (str(candidate.finishReason)) out.stopReason = str(candidate.finishReason);
      const u = obj(item.usageMetadata);
      if (Object.keys(u).length) {
        const cached = num(u.cachedContentTokenCount);
        setUsage({
          input: num(u.promptTokenCount) - cached,
          output: num(u.candidatesTokenCount),
          cacheRead: cached,
        });
      }
    } else {
      // OpenAI Responses API (plain and streamed `response.*` events).
      const response = obj(item.object === 'response' ? item : item.response);
      if (Object.keys(response).length) {
        if (str(response.model)) out.model = str(response.model);
        if (str(response.status)) out.stopReason = str(response.status);
        for (const entry of arr(response.output)) {
          const e = obj(entry);
          if (e.type === 'function_call' && str(e.name)) out.toolCalls.push(e.name as string);
          if (!streamed && e.type === 'message') out.text += textOf(e.content);
        }
        const u = obj(response.usage);
        if (Object.keys(u).length) {
          const cached = num(obj(u.input_tokens_details).cached_tokens);
          setUsage({
            input: num(u.input_tokens) - cached,
            output: num(u.output_tokens),
            cacheRead: cached,
          });
        }
      }
      if (item.type === 'response.output_text.delta' && str(item.delta)) out.text += item.delta;

      // OpenAI Chat Completions (plain and streamed chunks).
      if (str(item.model) && !Object.keys(response).length) out.model = str(item.model);
      const choice = obj(arr(item.choices)[0]);
      const message = obj(choice.message ?? choice.delta);
      if (str(message.content)) out.text += message.content;
      for (const call of arr(message.tool_calls)) {
        const name = str(obj(obj(call).function).name);
        if (name) out.toolCalls.push(name);
      }
      if (str(choice.finish_reason)) out.stopReason = str(choice.finish_reason);
      const u = obj(item.usage);
      if (!Object.keys(response).length && Object.keys(u).length) {
        const cached = num(obj(u.prompt_tokens_details).cached_tokens);
        setUsage({
          input: num(u.prompt_tokens) - cached,
          output: num(u.completion_tokens),
          cacheRead: cached,
        });
      }
    }
  }
  if (usage) out.usage = usage;
  return out;
}
