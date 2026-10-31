import { describe, expect, it } from 'vitest';

import { mdFence, mdTable, mdText } from './markdown.ts';

describe('mdText', () => {
  it('leaves plain words alone', () => {
    expect(mdText('The Service holds stock.')).toBe('The Service holds stock.');
  });

  it('escapes links, images, HTML, code and emphasis so they stay text', () => {
    expect(mdText('[a](https://x)')).toBe('\\[a\\]\\(https://x\\)');
    expect(mdText('![a](https://x)')).toBe('\\!\\[a\\]\\(https://x\\)');
    expect(mdText('<script>alert(1)</script>')).toBe('\\<script\\>alert\\(1\\)\\</script\\>');
    expect(mdText('`a` *b* _c_ ~d~')).toBe('\\`a\\` \\*b\\* \\_c\\_ \\~d\\~');
  });

  it('keeps one block: line breaks, headings, lists and tables cannot start', () => {
    expect(mdText('one\n\n# two\r\nthree')).toBe('one \\# two three');
    expect(mdText('# heading')).toBe('\\# heading');
    expect(mdText('- item')).toBe('\\- item');
    expect(mdText('1. item')).toBe('1\\. item');
    expect(mdText('a | b')).toBe('a \\| b');
  });
});

describe('mdFence', () => {
  it('uses three backticks for plain code', () => {
    expect(mdFence('a\nb\n', 'mermaid')).toBe('```mermaid\na\nb\n```');
  });

  it('makes the fence longer than any backticks inside, so the code cannot close it', () => {
    expect(mdFence('```\nnot a fence\n```')).toBe('````\n```\nnot a fence\n```\n````');
  });
});

describe('mdTable', () => {
  it('writes the head, the rule and the rows', () => {
    expect(mdTable(['A', 'B'], [['1', '2']])).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });
});
