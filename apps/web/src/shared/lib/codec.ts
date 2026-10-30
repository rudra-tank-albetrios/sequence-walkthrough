/**
 * The code inside a link. Version 2 wrote `#z.<base64url(deflate(code))>&step=N` and also read
 * mermaid.live's `#pako:` and `#base64:` states; version 3 keeps both so old links still open.
 */

const toBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const fromBase64 = (text: string): Uint8Array => {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const base64url = (bytes: Uint8Array): string =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const fromBase64url = (text: string): Uint8Array => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4));
};

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(source).arrayBuffer());
}

/** zlib-wrapped DEFLATE (RFC 1950), the format mermaid.live and version 2 use. */
export const deflate = (text: string): Promise<Uint8Array> =>
  pipe(new TextEncoder().encode(text), new CompressionStream('deflate'));

export const inflate = async (bytes: Uint8Array): Promise<string> =>
  new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate')));

/** The fragment of a viewer link: `#z.<data>` plus `&step=N` when a step is current. */
export async function shareFragment(code: string, step: number | null): Promise<string> {
  const data = base64url(await deflate(code));
  return `#z.${data}${step !== null && step >= 0 ? `&step=${step + 1}` : ''}`;
}

export interface LiveState {
  code: string;
  theme: string | null;
}

/** Reads a mermaid.live state (`pako:` or `base64:` part). */
export async function readLiveState(kind: 'pako' | 'base64', data: string): Promise<LiveState> {
  const json =
    kind === 'pako' ? await inflate(fromBase64url(data)) : new TextDecoder().decode(fromBase64url(data));
  const state = JSON.parse(json) as { code?: unknown; mermaid?: unknown };
  let theme: string | null = null;
  try {
    if (typeof state.mermaid === 'string') {
      const config = JSON.parse(state.mermaid) as { theme?: unknown };
      if (typeof config.theme === 'string') theme = config.theme;
    }
  } catch {
    theme = null;
  }
  return { code: typeof state.code === 'string' ? state.code : '', theme };
}

/** `https://mermaid.live/edit#pako:…` for the code with the viewer's theme and grid choice. */
export async function liveLink(code: string, theme: string, grid: boolean): Promise<string> {
  const state = {
    code,
    mermaid: JSON.stringify({ theme }, null, 2),
    autoSync: true,
    rough: false,
    updateDiagram: true,
    panZoom: true,
    grid,
  };
  return `https://mermaid.live/edit#pako:${base64url(await deflate(JSON.stringify(state)))}`;
}

export const LIVE_LINK_RE = /#(pako|base64):([A-Za-z0-9\-_+/=]+)/;

export interface ParsedHash {
  code: string | null;
  /** 0-based step index from `step=N` or `step-N`, or null. */
  step: number | null;
  failed: boolean;
}

/** Reads a viewer link's fragment (without `#`). Parts may come in any order. */
export async function parseHash(hash: string): Promise<ParsedHash> {
  const result: ParsedHash = { code: null, step: null, failed: false };
  for (const part of hash.replace(/^#/, '').split('&')) {
    const stepMatch = /^step[=-](\d+)$/.exec(part);
    if (stepMatch?.[1]) {
      result.step = Number(stepMatch[1]) - 1;
      continue;
    }
    try {
      if (part.startsWith('z.')) result.code = await inflate(fromBase64url(part.slice(2)));
      else if (part.startsWith('pako:')) result.code = (await readLiveState('pako', part.slice(5))).code;
      else if (part.startsWith('base64:')) result.code = (await readLiveState('base64', part.slice(7))).code;
    } catch {
      result.failed = true;
    }
  }
  return result;
}
