import cyrillicExt from '../../shared/fonts/recursive-cyrillic-ext.woff2?url';
import latinExt from '../../shared/fonts/recursive-latin-ext.woff2?url';
import latin from '../../shared/fonts/recursive-latin.woff2?url';
import vietnamese from '../../shared/fonts/recursive-vietnamese.woff2?url';

/**
 * `@font-face` rules with the font files inlined, so an exported SVG or PNG shows the same face as
 * the page. The subsets and ranges are those of shared/fonts/recursive.css.
 */

interface Subset {
  url: string;
  unicodeRange: string;
  ranges: [number, number][];
}

/** Diagram text uses `Recursive`; the redux themes also name `"Recursive Variable"`. */
export const FONT_FAMILIES = ['Recursive', 'Recursive Variable'] as const;

const RANGES: [string, string][] = [
  [cyrillicExt, 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F'],
  [
    vietnamese,
    'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
  ],
  [
    latinExt,
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  ],
  [
    latin,
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  ],
];

export function parseRanges(text: string): [number, number][] {
  return text
    .split(',')
    .map((part) => part.trim().replace(/^U\+/i, ''))
    .filter(Boolean)
    .map((part) => {
      if (part.includes('?')) return [parseInt(part.replace(/\?/g, '0'), 16), parseInt(part.replace(/\?/g, 'F'), 16)];
      const [a, b] = part.split('-');
      return [parseInt(a ?? '0', 16), parseInt(b ?? a ?? '0', 16)];
    });
}

const SUBSETS: Subset[] = RANGES.map(([url, unicodeRange]) => ({ url, unicodeRange, ranges: parseRanges(unicodeRange) }));

const cache = new Map<string, Promise<string>>();

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fontBase64(url: string): Promise<string> {
  // The one-file build inlines the font files, and its policy allows no fetch of a data: URL.
  if (url.startsWith('data:')) return Promise.resolve(url.slice(url.indexOf(',') + 1));
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return toBase64(new Uint8Array(await response.arrayBuffer()));
    });
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}

/** The subsets that cover any character of `text`. */
export function subsetsFor(text: string): Subset[] {
  const points = [...new Set(text)].map((c) => c.codePointAt(0) ?? 0);
  return SUBSETS.filter((s) => points.some((cp) => s.ranges.some(([a, b]) => cp >= a && cp <= b)));
}

export interface EmbeddedFonts {
  css: string;
  /** False when a font file could not be read, so the file may fall back to another face. */
  ok: boolean;
}

export async function embedFontCss(text: string): Promise<EmbeddedFonts> {
  let css = '';
  let ok = true;
  for (const subset of subsetsFor(text)) {
    try {
      const data = await fontBase64(subset.url);
      for (const family of FONT_FAMILIES) {
        css += `@font-face{font-family:"${family}";font-style:normal;font-weight:300 1000;unicode-range:${subset.unicodeRange};src:url(data:font/woff2;base64,${data}) format("woff2");}\n`;
      }
    } catch {
      ok = false;
    }
  }
  return { css, ok };
}
