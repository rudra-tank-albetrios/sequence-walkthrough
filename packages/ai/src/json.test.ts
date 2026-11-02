import { describe, expect, it } from 'vitest';

import { completeJson, parseJsonLoosely } from './json.ts';

describe('parseJsonLoosely', () => {
  it('parses whole JSON as it is', () => {
    expect(parseJsonLoosely('{"questions":[{"step":3}]}')).toEqual({ questions: [{ step: 3 }] });
    expect(parseJsonLoosely('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('keeps the whole questions of a reply cut inside a later one', () => {
    const cut = '{"questions":[{"step":1,"answer":"a"},{"step":2,"answer":"b"},{"step":3,"ans';
    expect(parseJsonLoosely(cut)).toEqual({
      questions: [
        { step: 1, answer: 'a' },
        { step: 2, answer: 'b' },
      ],
    });
  });

  it('drops a question cut inside its options, rather than keeping half of it', () => {
    const cut = '{"questions":[{"step":1,"answer":"a"},{"step":2,"options":["x","y';
    expect(parseJsonLoosely(cut)).toEqual({ questions: [{ step: 1, answer: 'a' }] });
  });

  it('cuts after a complete member of an object', () => {
    expect(parseJsonLoosely('{"marks":[{"id":1,"mark":"correct"},{"id":2,"mark":"par')).toEqual({
      marks: [{ id: 1, mark: 'correct' }],
    });
    expect(parseJsonLoosely('{"a":1,"b":{"c":2},"d":')).toEqual({ a: 1, b: { c: 2 } });
  });

  it('drops a dangling comma and an unfinished string', () => {
    expect(parseJsonLoosely('{"questions":[{"step":1},')).toEqual({ questions: [{ step: 1 }] });
    expect(parseJsonLoosely('["a","b","c')).toEqual(['a', 'b']);
    // An escaped quote does not end the unfinished string.
    expect(parseJsonLoosely('["a","b","c\\"d')).toEqual(['a', 'b']);
  });

  it('ignores brackets inside strings', () => {
    const cut = '{"questions":[{"q":"What is {x} or [y]?","a":"z"},{"q":"[';
    expect(parseJsonLoosely(cut)).toEqual({ questions: [{ q: 'What is {x} or [y]?', a: 'z' }] });
  });

  it('drops text after a complete top-level value', () => {
    expect(parseJsonLoosely('{"ok":true} Good luck!')).toEqual({ ok: true });
  });

  it('throws when nothing is complete', () => {
    for (const text of ['', '{', '{"questions":[', '{"questions":[{"step":', 'words', '"open']) {
      expect(() => parseJsonLoosely(text)).toThrow();
    }
  });

  it('completeJson closes what it keeps', () => {
    expect(completeJson('{"questions":[{"step":1},{"step":2')).toBe('{"questions":[{"step":1}]}');
    expect(completeJson('[[1,2],[3')).toBe('[[1,2]]');
  });
});
