import DOMPurify from 'dompurify';
import type mermaidDefault from 'mermaid';
import type { MermaidConfig } from 'mermaid';

type Mermaid = typeof mermaidDefault;

let loading: Promise<Mermaid> | null = null;

/** Mermaid is large, so it is a separate chunk loaded the first time a diagram is drawn. */
function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(
    (m) => m.default,
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

export class DiagramSyntaxError extends Error {
  override readonly name = 'DiagramSyntaxError';
}

export class MermaidLoadError extends Error {
  override readonly name = 'MermaidLoadError';
}

/** Perceived brightness 0..1 of a CSS colour that Mermaid gives as a hex string. */
function luminance(color: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m?.[1]) return 1;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Pasted code is untrusted (plan section 4): Mermaid runs at `securityLevel: 'strict'` and every
 * SVG it produces goes through DOMPurify before it reaches the page. `name` is kept because Mermaid
 * marks participants with it, and `<style>` because the theme lives there.
 */
function sanitize(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['style'],
    ADD_ATTR: ['name', 'dominant-baseline', 'marker-end', 'marker-start'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'href', 'xlink:href'],
  });
}

/** Draws the code with the given theme. Throws DiagramSyntaxError when Mermaid refuses it. */
export async function renderDiagram(code: string, theme: string, id: string): Promise<RenderedDiagram> {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    theme: theme as NonNullable<MermaidConfig['theme']>,
    securityLevel: 'strict',
    // Mermaid's own default, stated so the limit on pasted and dropped code is visible here.
    maxTextSize: 50000,
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
  try {
    await mermaid.parse(code);
  } catch (error) {
    throw new DiagramSyntaxError(error instanceof Error ? error.message : String(error));
  }
  let rendered: { svg: string };
  try {
    rendered = await mermaid.render(id, code);
  } catch (error) {
    document.getElementById(`d${id}`)?.remove();
    throw new DiagramSyntaxError(error instanceof Error ? error.message : String(error));
  }
  return { svg: sanitize(rendered.svg), themeBg, dark: luminance(themeBg) < 0.4 };
}
