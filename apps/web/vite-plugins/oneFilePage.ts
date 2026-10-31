/// <reference types="node" />
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Plugin } from 'vite';

import { zipEntries } from './skillKit.ts';

/**
 * Turns the page vite-plugin-singlefile has inlined into what the one-file build gives people
 * (docs/decisions.md, phase 4):
 *   sequence-walkthrough.html          the whole page with its own policy, to open from disk
 *   sequence-viewer.html               no skeleton and no policy, to publish as a Claude artifact
 *   sequence-walkthrough-one-file.zip  both, which is what the website publishes
 */
const PAGE_FILE = 'sequence-walkthrough.html';
const ARTIFACT_FILE = 'sequence-viewer.html';
const ZIP_FILE = 'sequence-walkthrough-one-file.zip';

const ZIP_README = `The Sequence Walkthrough viewer as one file. Everything is inside it, so it needs no internet.

${PAGE_FILE}: double-click it to open it in your browser.

${ARTIFACT_FILE}: only for publishing as a Claude artifact. Declare the "sample" capability for the
Claude provider in Ask AI and "downloads" for the export menu. It has no security policy of its own,
because the artifact host sets that, so do not put this file on a website of your own.
`;

/** The policy of the file opened from disk, as strict as a page with one inlined script can be. */
function policyFor(code: string): string {
  // A browser hashes the script's text after the parser has normalised its line endings.
  const hash = createHash('sha256').update(code.replace(/\r\n?/g, '\n'), 'utf8').digest('base64');
  return [
    // The page loads nothing, so everything not named below stays off.
    "default-src 'none'",
    // Only this exact script may run: 'self' would block it, 'unsafe-inline' would allow any other.
    `script-src 'sha256-${hash}'`,
    // Mermaid writes <style> elements and style attributes into the diagrams it draws.
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    // Ask AI calls the model URL the user chose; Ollama runs on localhost over http.
    'connect-src https: http://localhost:* http://127.0.0.1:*',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** Both pages, from the document Vite wrote. Throws when anything is left outside the page. */
export function assemblePages(html: string): { page: string; artifact: string } {
  const open = /<script type="module"[^>]*>/.exec(html);
  if (!open) throw new Error('the page has no inlined module script');
  const codeStart = open.index + open[0].length;
  // vite-plugin-singlefile escapes "</script>" inside the code, so the first one is the real end.
  const codeEnd = html.indexOf('</script>', codeStart);
  if (codeEnd < 0) throw new Error('the inlined script has no end');
  const code = html.slice(codeStart, codeEnd);
  const around = html.slice(0, open.index) + html.slice(codeEnd);
  if (/<script\s|<link\b(?![^>]*\brel="icon")/.test(around)) {
    throw new Error('a script or stylesheet is still outside the page');
  }

  const pick = (pattern: RegExp, what: string): string => {
    const found = pattern.exec(around)?.[0];
    if (!found) throw new Error(`the page has no ${what}`);
    return found;
  };
  // The policy has to come before what it protects. A meta charset stays in the first 1024 bytes.
  const charset = pick(/<meta charset="[^"]*"\s*\/?>/, 'charset');
  const policy = `<meta http-equiv="Content-Security-Policy" content="${policyFor(code)}" />`;
  const page = html.replace(charset, () => `${charset}\n    ${policy}`);

  // What the artifact host wraps in its own skeleton: version 2's head, body and script, in order.
  const artifact = [
    pick(/<title>[^<]*<\/title>/, 'title'),
    pick(/<meta\s+name="description"[^>]*>/, 'description'),
    pick(/<style[^>]*>[\s\S]*?<\/style>/, 'stylesheet').replace(/^<style[^>]*>/, '<style>'),
    pick(/<div id="root"><\/div>/, 'root element'),
    `<script type="module">${code}</script>`,
    '',
  ].join('\n');
  return { page, artifact };
}

export function oneFilePage(): Plugin {
  let siteDir = '';
  let zip: Uint8Array | null = null;
  return {
    name: 'swv:one-file-page',
    enforce: 'post',
    configResolved(config) {
      siteDir = resolve(config.root, 'dist');
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const outside = Object.keys(bundle).filter((name) => name !== 'index.html');
        if (outside.length > 0) this.error(`not inlined into the page: ${outside.join(', ')}`);
        const index = bundle['index.html'];
        if (index?.type !== 'asset') this.error('the build wrote no index.html');
        const { page, artifact } = assemblePages(
          typeof index.source === 'string' ? index.source : new TextDecoder().decode(index.source),
        );
        const encoder = new TextEncoder();
        zip = zipEntries([
          [PAGE_FILE, encoder.encode(page)],
          [ARTIFACT_FILE, encoder.encode(artifact)],
          ['README.txt', encoder.encode(ZIP_README)],
        ]);
        delete bundle['index.html'];
        this.emitFile({ type: 'asset', fileName: PAGE_FILE, source: page });
        this.emitFile({ type: 'asset', fileName: ARTIFACT_FILE, source: artifact });
        this.emitFile({ type: 'asset', fileName: ZIP_FILE, source: zip });
      },
    },
    writeBundle() {
      // `npm run build` builds the website first, and the zip is published next to it.
      if (zip && existsSync(siteDir)) writeFileSync(resolve(siteDir, ZIP_FILE), zip);
    },
  };
}
