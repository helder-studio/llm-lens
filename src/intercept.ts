import { providerOf } from './core/parse';
import type { Lens } from './core/store';

// Minimal shapes so the package builds without DOM or React Native types.
interface ReaderLike {
  read(): Promise<{ done: boolean; value?: unknown }>;
}
interface ResponseLike {
  status: number;
  clone?(): ResponseLike;
  text?(): Promise<string>;
  body?: { getReader?(): ReaderLike } | null;
}
type FetchLike = (
  input: unknown,
  init?: { method?: string; body?: unknown },
) => Promise<ResponseLike>;
interface XhrLike {
  status: number;
  responseText?: string;
  open(method: string, url: string, ...rest: unknown[]): void;
  send(body?: unknown): void;
  addEventListener?(type: string, listener: () => void, options?: { once?: boolean }): void;
}

const g = globalThis as unknown as {
  fetch?: FetchLike;
  XMLHttpRequest?: { prototype: XhrLike };
  TextDecoder?: new () => { decode(chunk: unknown, options?: { stream?: boolean }): string };
  navigator?: { product?: string };
};

const INSTALLED = Symbol.for('helder-studio.llm-lens');
type Saved = { fetch?: FetchLike; open?: XhrLike['open']; send?: XhrLike['send'] };
const registry = globalThis as unknown as Record<symbol, Saved | undefined>;
const URL_KEY = Symbol('llm-lens-url');

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  return (input as { url?: string } | undefined)?.url ?? String(input);
}

/** Reads a copy of the body in the background: notes the first byte, then the full text. */
async function capture(res: ResponseLike, handle: ReturnType<Lens['start']>) {
  try {
    const copy = res.clone?.();
    const reader = copy?.body?.getReader?.();
    if (reader && g.TextDecoder) {
      const decoder = new g.TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        handle.firstByte();
        text += decoder.decode(value, { stream: true });
      }
      handle.finish(res.status, text);
      return;
    }
    handle.finish(res.status, (await copy?.text?.()) ?? '');
  } catch (error) {
    handle.fail(error instanceof Error ? error.message : String(error));
  }
}

function patchFetch(lens: Lens, original: FetchLike): FetchLike {
  return async (input, init) => {
    const url = urlOf(input);
    const provider = providerOf(url);
    if (!provider) return original(input, init);
    const handle = lens.start(
      provider,
      url,
      typeof init?.body === 'string' ? init.body : undefined,
    );
    let res: ResponseLike;
    try {
      res = await original(input, init);
    } catch (error) {
      handle.fail(error instanceof Error ? error.message : String(error));
      throw error;
    }
    void capture(res, handle);
    return res;
  };
}

function patchXhr(lens: Lens, proto: XhrLike, saved: Saved) {
  const { open, send } = saved as Required<Pick<Saved, 'open' | 'send'>>;
  type Tracked = XhrLike & { [URL_KEY]?: string };
  proto.open = function (this: Tracked, method: string, url: string, ...rest: unknown[]) {
    this[URL_KEY] = String(url);
    return open.call(this, method, url, ...rest);
  };
  proto.send = function (this: Tracked, body?: unknown) {
    const url = this[URL_KEY];
    const provider = url ? providerOf(url) : undefined;
    if (url && provider) {
      const handle = lens.start(provider, url, typeof body === 'string' ? body : undefined);
      this.addEventListener?.('progress', () => handle.firstByte(), { once: true });
      this.addEventListener?.(
        'loadend',
        () => {
          let text = '';
          try {
            text = this.responseText ?? '';
          } catch {
            // responseType isn't text: no body to read.
          }
          if (this.status === 0 && !text) handle.fail('Network request failed');
          else handle.finish(this.status, text);
        },
        { once: true },
      );
    }
    return send.call(this, body);
  };
}

/**
 * Records LLM calls made through fetch (web; React Native's fetch runs on XMLHttpRequest) and
 * XMLHttpRequest. Idempotent. Install after network-chaos to also see the faults it injects.
 */
export function install(lens: Lens): void {
  if (registry[INSTALLED]) return;
  const saved: Saved = {};
  if (g.fetch && g.navigator?.product !== 'ReactNative') {
    saved.fetch = g.fetch;
    g.fetch = patchFetch(lens, g.fetch);
  }
  const proto = g.XMLHttpRequest?.prototype;
  if (proto) {
    saved.open = proto.open;
    saved.send = proto.send;
    patchXhr(lens, proto, saved);
  }
  registry[INSTALLED] = saved;
}

export function uninstall(): void {
  const saved = registry[INSTALLED];
  if (!saved) return;
  if (saved.fetch) g.fetch = saved.fetch;
  const proto = g.XMLHttpRequest?.prototype;
  if (proto && saved.open && saved.send) {
    proto.open = saved.open;
    proto.send = saved.send;
  }
  registry[INSTALLED] = undefined;
}
