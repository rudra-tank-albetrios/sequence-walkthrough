/**
 * Building Markdown files out of untrusted text (flow labels, model replies, typed answers). The
 * text must stay text in whatever renders the file: no links, images, HTML or headings of its own.
 */

/** One line of text with every Markdown and HTML control character escaped. */
export function mdText(text: string): string {
  return text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/[\\`*_{}[\]()<>#+!|~]/g, '\\$&')
    .replace(/^(\s*)(\d+)\./, '$1$2\\.')
    .replace(/^(\s*)-/, '$1\\-');
}

/** A fenced code block whose fence is longer than any run of backticks inside it. */
export function mdFence(code: string, language = ''): string {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${language}\n${code.replace(/\s+$/, '')}\n${fence}`;
}

/** A table from already escaped cells. */
export function mdTable(head: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}
