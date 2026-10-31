import { useDiagramStore } from '../state/diagramStore.ts';
import { toast } from '../ui/toast.ts';
import { embedFontCss, FONT_FAMILIES } from './fonts.ts';

/** A stand-alone SVG document from the rendered diagram, with the fonts embedded. */

const SVGNS = 'http://www.w3.org/2000/svg';
const XLINKNS = 'http://www.w3.org/1999/xlink';

export interface SvgDocumentOptions {
  width: number;
  height: number;
  background: string;
  /** `@font-face` rules to put in a `<style>` at the top; empty for none. */
  fontCss: string;
}

/**
 * The markup as an element of its own document. The clean SVG is the page's serialisation of
 * Mermaid's output, which is usually well-formed XML; when it is not (an HTML entity, say), the
 * HTML parser reads it and the XML serialiser writes it out well-formed.
 */
export function parseSvg(markup: string): Element {
  const parser = new DOMParser();
  const xml = parser.parseFromString(markup, 'image/svg+xml');
  const root = xml.documentElement;
  if (root.localName === 'svg' && !xml.querySelector('parsererror')) return root;
  // The markup was already sanitised by the viewer; the parser-only document runs nothing.
  const svg = parser.parseFromString(markup, 'text/html').querySelector('svg');
  if (!svg) throw new Error('The diagram has no SVG');
  return svg;
}

function decorate(svg: Element, options: SvgDocumentOptions): void {
  svg.setAttribute('xmlns', SVGNS);
  svg.setAttribute('xmlns:xlink', XLINKNS);
  svg.setAttribute('width', String(options.width));
  svg.setAttribute('height', String(options.height));
  svg.setAttribute('style', `background-color: ${options.background}`);
  if (options.fontCss) {
    const style = svg.ownerDocument.createElementNS(SVGNS, 'style');
    style.textContent = options.fontCss;
    svg.insertBefore(style, svg.firstChild);
  }
}

/** The clean SVG markup as a complete file. */
export function buildSvgDocument(markup: string, options: SvgDocumentOptions): string {
  const svg = parseSvg(markup);
  decorate(svg, options);
  return new XMLSerializer().serializeToString(svg);
}

/** The live SVG with its highlights, minus the invisible hit areas. */
export function buildLiveSvgDocument(live: SVGSVGElement, options: SvgDocumentOptions): string {
  const svg = live.cloneNode(true) as SVGSVGElement;
  svg.querySelectorAll('.swv-hit').forEach((n) => {
    n.remove();
  });
  decorate(svg, options);
  return new XMLSerializer().serializeToString(svg);
}

export const usesRecursive = (markup: string): boolean => FONT_FAMILIES.some((f) => markup.includes(f));

let warnedFont = false;

async function fontCssFor(markup: string, text: string): Promise<string> {
  if (!usesRecursive(markup)) return '';
  const { css, ok } = await embedFontCss(`${text} `);
  if (!ok && !warnedFont) {
    warnedFont = true;
    toast('The font could not be embedded here, so the file may use a fallback font.');
  }
  return css;
}

/**
 * The diagram as an SVG file string: the clean render, or the live element when given (for the
 * step image). Null when nothing has been drawn yet.
 */
export async function diagramSvgString(live: SVGSVGElement | null = null): Promise<string | null> {
  const { cleanSvg, width, height, themeBg } = useDiagramStore.getState();
  if (!cleanSvg) return null;
  const text = live ? live.textContent : parseSvg(cleanSvg).textContent;
  const options: SvgDocumentOptions = {
    width,
    height,
    background: themeBg,
    fontCss: await fontCssFor(cleanSvg, text),
  };
  return live ? buildLiveSvgDocument(live, options) : buildSvgDocument(cleanSvg, options);
}
