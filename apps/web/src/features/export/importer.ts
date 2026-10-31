import { LIVE_LINK_RE, readLiveState } from '../../shared/lib/codec.ts';

/**
 * Reading pasted text, links and files into Mermaid code, exactly as version 2's `Importer` did.
 * Nothing here touches the page: the result says what to load and what to tell the user.
 */

const LIVE_LINK_START_RE = /^\s*https?:\/\/(www\.)?mermaid\.(live|ink)\/[^\s]*#(pako|base64):/;

const DIAGRAM_KEYWORD_RE =
  /^(sequenceDiagram|flowchart|graph|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|xychart|sankey|block|packet|kanban|architecture|requirementDiagram|C4)/;

const MARKDOWN_BLOCK_RE = /```\s*mermaid[^\n]*\n([\s\S]*?)```/i;

export const ACCEPTED_EXTENSIONS = ['mmd', 'md', 'txt', 'mermaid', 'markdown'] as const;

/** The `accept` of the hidden file input. */
export const FILE_ACCEPT = '.mmd,.md,.txt,.mermaid,text/plain,text/markdown';

export const DROP_HINT = 'Drop a .mmd, .md or .txt file';

export const isLiveLink = (text: string): boolean => LIVE_LINK_START_RE.test(text);

/** True when the first real line (not a `%%` comment or `---` front matter) starts a diagram. */
export function looksLikeMermaid(text: string): boolean {
  const first = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%') && line !== '---');
  return first !== undefined && DIAGRAM_KEYWORD_RE.test(first);
}

/** The code inside the first ```` ```mermaid ```` block, or null when the text has none. */
export function extractMarkdown(text: string): string | null {
  const match = MARKDOWN_BLOCK_RE.exec(text);
  return match?.[1] === undefined ? null : match[1].replace(/\n$/, '');
}

export type ImportResult =
  | { ok: true; code: string; theme: string | null; message: string | null }
  | { ok: false; message: string };

/** Reads a mermaid.live or mermaid.ink link's state. */
export async function importLiveLink(link: string): Promise<ImportResult> {
  const match = LIVE_LINK_RE.exec(link.trim());
  if (!match?.[1] || !match[2]) return { ok: false, message: 'Could not import: This is not a mermaid.live link' };
  try {
    const kind = match[1] === 'pako' ? 'pako' : 'base64';
    const state = await readLiveState(kind, match[2]);
    return { ok: true, code: state.code, theme: state.theme, message: 'Loaded the diagram from the mermaid.live link' };
  } catch (error) {
    return { ok: false, message: `Could not import: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** A mermaid.live link, Markdown with a mermaid block, or plain Mermaid code. */
export async function importText(text: string): Promise<ImportResult> {
  if (isLiveLink(text)) return importLiveLink(text);
  return { ok: true, code: extractMarkdown(text) ?? text, theme: null, message: null };
}

export const fileExtension = (name: string): string => (name.split('.').pop() ?? '').toLowerCase();

/** `.mmd`, `.txt` and `.mermaid` files are code; `.md` and `.markdown` must hold a mermaid block. */
export async function importFile(file: { name: string; text: () => Promise<string> }): Promise<ImportResult> {
  const ext = fileExtension(file.name);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return { ok: false, message: DROP_HINT };
  const text = await file.text();
  if (ext === 'md' || ext === 'markdown') {
    const code = extractMarkdown(text);
    if (code === null) return { ok: false, message: `${file.name} has no \`\`\`mermaid block` };
    return { ok: true, code, theme: null, message: `Loaded ${file.name}` };
  }
  return { ok: true, code: text, theme: null, message: `Loaded ${file.name}` };
}
