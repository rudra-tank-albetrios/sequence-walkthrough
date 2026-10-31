import type DOMPurifyDefault from 'dompurify';
import type mermaidDefault from 'mermaid';
import type { MermaidConfig } from 'mermaid';

import { MAX_CODE_SIZE } from '../../shared/state/flowStore.ts';

type Mermaid = typeof mermaidDefault;
type Purifier = typeof DOMPurifyDefault;

let loading: Promise<[Mermaid, Purifier]> | null = null;

/**
 * Mermaid is large, so it is a separate chunk loaded the first time a diagram is drawn. DOMPurify is
 * only ever used on Mermaid's output, so it travels with it and stays out of the first load.
 */
function loadMermaid(): Promise<[Mermaid, Purifier]> {
  loading ??= Promise.all([import('mermaid'), import('dompurify')]).then(
    ([m, purify]) => [m.default, purify.default],
    () => {
      loading = null;
      throw new MermaidLoadError('Mermaid could not be loaded. Check the connection and reload the page.');
    },
  );
  return loading;
}

export interface RenderedDiagram {
  /** The SVG markup after DOMPurify. */
  svg: string;
  /** The theme's page background, used behind the canvas and in exports. */
  themeBg: string;
  dark: boolean;
}

class DiagramSyntaxError extends Error {
  override readonly name = 'DiagramSyntaxError';
}

export class MermaidLoadError extends Error {
  override readonly name = 'MermaidLoadError';
}

/** Perceived brightness 0..1 of a CSS colour that Mermaid gives as a hex string. */
function luminance(color: string): number {
  // Mermaid's dark themes use the short form, "#333".
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m?.[1]) return 1;
  const hex = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * CSS that came from the diagram (an `%%{init}%%` directive can set `themeCSS`) may not fetch
 * anything: `@import` goes, and so does every `url()` that is not a reference into the SVG itself.
 */
function inertCss(css: string): string {
  return css.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, 'none');
}

/**
 * Pasted code is untrusted (plan section 4): Mermaid runs at `securityLevel: 'strict'` and every
 * SVG it produces goes through DOMPurify before it reaches the page. `name` is kept because Mermaid
 * marks participants with it, and `<style>` because the theme lives there, made inert.
 */
function sanitize(DOMPurify: Purifier, svg: string): string {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['style'],
    ADD_ATTR: ['name', 'dominant-baseline', 'marker-end', 'marker-start'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'href', 'xlink:href'],
  });
  return clean
    .replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
      (_, open: string, css: string, close: string) => `${open}${inertCss(css)}${close}`,
    )
    .replace(/\sstyle="([^"]*)"/gi, (_, css: string) => ` style="${inertCss(css)}"`);
}

/**
 * Mermaid puts its drawing in the document before the sanitiser sees it, and the browser would
 * fetch what the theme CSS of an `%%{init}%%` directive or front matter names at that moment. So
 * the config inside the code is made inert first; the arrows and lines stay as they were.
 */
const inertConfig = (code: string): string =>
  code.replace(/%%\{[\s\S]*?\}%%/g, inertCss).replace(/^---\r?\n[\s\S]*?\r?\n---/, inertCss);

/** Draws the code with the given theme. Throws DiagramSyntaxError when Mermaid refuses it. */
export async function renderDiagram(code: string, theme: string, id: string): Promise<RenderedDiagram> {
  const [mermaid, DOMPurify] = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    theme: theme as NonNullable<MermaidConfig['theme']>,
    securityLevel: 'strict',
    // Labels as SVG text: HTML labels need <foreignObject>, which the sanitiser and exports refuse.
    htmlLabels: false,
    maxTextSize: MAX_CODE_SIZE,
  });
  let themeBg = theme.includes('dark') ? '#1e1e1e' : '#ffffff';
  try {
    // The theme's page background is only reachable through the older API.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const config: MermaidConfig = mermaid.mermaidAPI.getConfig();
    const vars: unknown = config.themeVariables;
    const background =
      typeof vars === 'object' && vars !== null && 'background' in vars ? vars.background : undefined;
    if (typeof background === 'string' && background !== 'transparent') themeBg = background;
  } catch {
    /* keep the fallback */
  }
  if (code.length > MAX_CODE_SIZE) {
    throw new DiagramSyntaxError(
      `Maximum text size in diagram exceeded: ${code.length} characters, the limit is ${MAX_CODE_SIZE}`,
    );
  }
  const safeCode = inertConfig(code);
  try {
    await mermaid.parse(safeCode);
  } catch (error) {
    throw new DiagramSyntaxError(error instanceof Error ? error.message : String(error));
  }
  let rendered: { svg: string };
  try {
    rendered = await mermaid.render(id, safeCode);
  } catch (error) {
    document.getElementById(`d${id}`)?.remove();
    throw new DiagramSyntaxError(error instanceof Error ? error.message : String(error));
  }
  return { svg: sanitize(DOMPurify, rendered.svg), themeBg, dark: luminance(themeBg) < 0.4 };
}
