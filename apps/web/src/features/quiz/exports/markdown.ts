import { mdFence, mdTable, mdText } from '../../../shared/lib/markdown.ts';
import type { DocBlock } from './blocks.ts';

function blockText(block: DocBlock): string {
  switch (block.kind) {
    case 'title':
      return `# ${mdText(block.text)}`;
    case 'heading':
      return `## ${mdText(block.text)}`;
    case 'text':
      return mdText(block.text);
    case 'question':
      return `### ${block.number}. ${mdText(block.text)}\n\n*${mdText(block.meta)}*`;
    case 'option':
      return `- [${block.correct ? 'x' : ' '}] ${mdText(block.text)}`;
    case 'fact':
      return `**${mdText(block.label)}:** ${mdText(block.text)}`;
    case 'table':
      return mdTable(block.head.map(mdText), block.rows.map((row) => row.map(mdText)));
    case 'image':
      return `![${mdText(block.alt)}](${block.dataUrl})`;
    case 'code':
      return mdFence(block.text, block.language);
  }
}

/** A Markdown file. Everything from a flow, a model or the user is escaped, so it stays plain text. */
export function blocksToMarkdown(blocks: readonly DocBlock[]): string {
  let out = '';
  blocks.forEach((block, index) => {
    const tight = block.kind === 'option' && blocks[index - 1]?.kind === 'option';
    out += `${index === 0 ? '' : tight ? '\n' : '\n\n'}${blockText(block)}`;
  });
  return `${out}\n`;
}
