import { describe, expect, it } from 'vitest';

import { SKILLS } from './config.ts';
import { bundledPaths, checkFrontMatter, joinShared, readFrontMatter } from './skill-text.ts';

const [fast, detailed] = SKILLS as [(typeof SKILLS)[number], (typeof SKILLS)[number]];

describe('joinShared', () => {
  it('replaces an include that is alone on its line', () => {
    const text = joinShared('a\n{{shared/x.md}}\nb', (file) => `from ${file}\n`);
    expect(text).toBe('a\nfrom x.md\nb');
  });
  it('stops on an include it cannot resolve', () => {
    expect(() => joinShared('see {{shared/x.md}} here', () => '')).toThrow(/Unresolved include/);
    expect(() => joinShared('{{other/x.md}}', () => '')).toThrow(/Unresolved include/);
  });
  it('stops when a shared file is missing', () => {
    const missing = () => {
      throw new Error('ENOENT');
    };
    expect(() => joinShared('{{shared/x.md}}', missing)).toThrow('ENOENT');
  });
});

describe('readFrontMatter', () => {
  it('reads a name and a description', () => {
    expect(readFrontMatter('---\nname: a\ndescription: b c\n---\n\ntext')).toEqual({
      name: 'a',
      description: 'b c',
    });
  });
  it('refuses anything else, so a skill cannot ship without them', () => {
    expect(() => readFrontMatter('# no front matter')).toThrow(/front matter/);
    expect(() => readFrontMatter('---\nname: a\n---\n')).toThrow(/front matter/);
    expect(() => readFrontMatter('---\nname: a\ndescription:\n---\n')).toThrow(/front matter/);
  });
});

describe('checkFrontMatter', () => {
  const good = 'Does it. Say "diagram this flow", "how does X work" or "walk me through".';
  const check = (description: string, name = 'seq-diagram') => {
    checkFrontMatter({ name, description }, fast, [detailed]);
  };

  it('accepts a good description', () => {
    expect(() => {
      check(good);
    }).not.toThrow();
  });
  it('stops a description over the 1024 characters of the Claude app', () => {
    expect(() => {
      check(`${good} ${'x'.repeat(1024)}`);
    }).toThrow(/characters/);
  });
  it('stops text that would break the YAML line or the skill rules', () => {
    for (const bad of [`${good} note: this`, `${good} see #5`, `"${good}"`, `${good} <b>`]) {
      expect(() => {
        check(bad);
      }).toThrow(/plain YAML|angle brackets/);
    }
  });
  it('stops a bad name', () => {
    expect(() => {
      check(good, 'Seq_Diagram');
    }).toThrow(/front matter says name/);
    const longName = { ...fast, name: 'x'.repeat(65) };
    expect(() => {
      checkFrontMatter({ name: longName.name, description: good }, longName, []);
    }).toThrow(/at most 64/);
  });
  it('needs its own trigger phrases, in any case', () => {
    expect(() => {
      check('Does it. Say "diagram this flow" or "how does X work".');
    }).toThrow(/walk me through/);
    expect(() => {
      check(good.replace('diagram this flow', 'Diagram This Flow'));
    }).not.toThrow();
  });
  it('stops a trigger phrase of the other skill', () => {
    for (const phrase of detailed.triggers) {
      expect(() => {
        check(`${good} Or "${phrase.toUpperCase()}".`);
      }).toThrow(/a trigger of detailed-seq-diagram/);
    }
  });
});

describe('bundledPaths', () => {
  it('finds the paths that must ship, once each', () => {
    const text =
      'See `references/a.md`, then `examples/b.mmd`. Run `node scripts/c.mjs -`. Again references/a.md.';
    expect(bundledPaths(text)).toEqual(['references/a.md', 'examples/b.mmd', 'scripts/c.mjs']);
  });
  it('leaves project paths alone', () => {
    expect(bundledPaths('`src/scripts/x.ts`, `my-examples/y.md`, "<folder>/scripts/z.mjs"')).toEqual([]);
  });
});
