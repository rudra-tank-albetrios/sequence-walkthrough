// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isLiveLink, liveLink } from '../../shared/lib/codec.ts';
import { extractMarkdown, importFile, importText, looksLikeMermaid } from './importer.ts';

const CODE = 'sequenceDiagram\n  %% @title Imported\n  A->>B: hi';
const MARKDOWN = `# Notes\n\nSome text.\n\n\`\`\`mermaid\n${CODE}\n\`\`\`\n\nMore text.\n`;

const file = (name: string, text: string) => ({ name, text: () => Promise.resolve(text) });

describe('importer', () => {
  it('recognises mermaid.live and mermaid.ink links', () => {
    expect(isLiveLink('https://mermaid.live/edit#pako:abc')).toBe(true);
    expect(isLiveLink('  https://www.mermaid.ink/img/x#base64:abc')).toBe(true);
    expect(isLiveLink('https://example.com/#pako:abc')).toBe(false);
    expect(isLiveLink(CODE)).toBe(false);
  });

  it('recognises Mermaid code by its first real line', () => {
    expect(looksLikeMermaid(CODE)).toBe(true);
    expect(looksLikeMermaid('%% a comment\n---\nflowchart TD\nA-->B')).toBe(true);
    expect(looksLikeMermaid('hello\nsequenceDiagram')).toBe(false);
    expect(looksLikeMermaid('')).toBe(false);
  });

  it('extracts the first mermaid block from Markdown', () => {
    expect(extractMarkdown(MARKDOWN)).toBe(CODE);
    expect(extractMarkdown('```Mermaid title\nA\n```')).toBe('A');
    expect(extractMarkdown('no block here')).toBeNull();
  });

  it('dispatches text: link, Markdown, then plain code', async () => {
    const link = await liveLink(CODE, 'forest', false);
    expect(await importText(link)).toEqual({
      ok: true,
      code: CODE,
      theme: 'forest',
      message: 'Loaded the diagram from the mermaid.live link',
    });
    expect(await importText(MARKDOWN)).toEqual({ ok: true, code: CODE, theme: null, message: null });
    expect(await importText(CODE)).toEqual({ ok: true, code: CODE, theme: null, message: null });
  });

  it('reports a link whose state cannot be read', async () => {
    const result = await importText('https://mermaid.live/edit#pako:not-a-state');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toMatch(/^Could not import: /);
  });

  it('reads files by extension', async () => {
    expect(await importFile(file('flow.mmd', CODE))).toEqual({ ok: true, code: CODE, theme: null, message: 'Loaded flow.mmd' });
    expect(await importFile(file('README.md', MARKDOWN))).toEqual({ ok: true, code: CODE, theme: null, message: 'Loaded README.md' });
    expect(await importFile(file('README.md', 'no block'))).toEqual({ ok: false, message: 'README.md has no ```mermaid block' });
    expect(await importFile(file('photo.png', ''))).toEqual({ ok: false, message: 'Drop a .mmd, .md or .txt file' });
  });
});
