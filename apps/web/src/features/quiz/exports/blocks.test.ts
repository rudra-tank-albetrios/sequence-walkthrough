import { describe, expect, it } from 'vitest';

import { demoFlow } from '../testReplies.ts';
import type { Mark, Question } from '../types.ts';
import { flowBlocks, quizBlocks, resultBlocks, type DocBlock, type ResultDoc } from './blocks.ts';

const stepIndex = demoFlow.steps.findIndex((step) => step.key === 'APP→API|401 Unauthorized');
const choice: Question = {
  id: 'c',
  type: 'choice',
  difficulty: 'easy',
  stepIndex,
  topic: 'Status codes',
  text: 'Which status?',
  options: ['401 Unauthorized', '403 Forbidden', '404 Not Found', '500 Server Error'],
  answer: '401 Unauthorized',
  why: 'There is no valid token.',
};
const line: Question = { ...choice, id: 'l', type: 'line', difficulty: 'hard', options: [], text: 'Who answers?' };

const doc = (marks: Record<string, Mark>): ResultDoc => ({
  flow: demoFlow,
  questions: [choice, line],
  answers: { c: '403 Forbidden', l: 'The controller' },
  marks,
  time: { kind: 'stopwatch' },
  startedAt: 1000,
  finishedAt: 66_000,
  autoSubmitted: false,
});

const facts = (blocks: readonly DocBlock[], label: string): string[] =>
  blocks.flatMap((block) => (block.kind === 'fact' && block.label === label ? [block.text] : []));
const texts = (blocks: readonly DocBlock[]): string => JSON.stringify(blocks);

describe('the quiz file', () => {
  it('without answers gives nothing away', () => {
    const blocks = quizBlocks({ flow: demoFlow, questions: [choice, line] }, false);
    expect(facts(blocks, 'Correct answer')).toEqual([]);
    expect(facts(blocks, 'Reason')).toEqual([]);
    expect(blocks.filter((block) => block.kind === 'option' && block.correct)).toEqual([]);
    expect(texts(blocks)).not.toContain(choice.why);
    expect(blocks.filter((block) => block.kind === 'option')).toHaveLength(4);
    expect(blocks.filter((block) => block.kind === 'question')).toHaveLength(2);
  });

  it('with answers has the correct option, the answers and the reasons', () => {
    const blocks = quizBlocks({ flow: demoFlow, questions: [choice, line] }, true);
    const marked = blocks.filter((block) => block.kind === 'option' && block.correct);
    expect(marked).toEqual([{ kind: 'option', text: '401 Unauthorized', correct: true }]);
    expect(facts(blocks, 'Correct answer')).toEqual([choice.answer, line.answer]);
    expect(facts(blocks, 'Reason')).toEqual([choice.why, line.why]);
  });

  it('names the step of every question', () => {
    const [question] = quizBlocks({ flow: demoFlow, questions: [choice] }, false).filter(
      (block) => block.kind === 'question',
    );
    const step = demoFlow.steps[stepIndex];
    expect(question).toMatchObject({ number: 1, text: 'Which status?' });
    expect(JSON.stringify(question)).toContain(`Step ${String(step?.n)}:`);
  });
});

describe('the result file', () => {
  const marks: Record<string, Mark> = {
    c: { value: 'wrong', by: 'browser', feedback: '' },
    l: { value: 'partly', by: 'ai', feedback: 'It leaves out the middleware.' },
  };

  it('has the score, the time and the score tables', () => {
    const blocks = resultBlocks(doc(marks));
    expect(blocks[1]).toEqual({ kind: 'text', text: 'Score: 0.5 of 2 (25%)' });
    expect(blocks[2]).toEqual({ kind: 'text', text: 'Time: 1:05.' });
    const tables = blocks.filter((block) => block.kind === 'table');
    expect(tables[0]).toMatchObject({ head: ['Chapter', 'Score'] });
    expect(tables[1]).toMatchObject({
      head: ['Difficulty', 'Score'],
      rows: [
        ['Easy', '0 of 1 (0%)'],
        ['Hard', '0.5 of 1 (50%)'],
      ],
    });
    expect(tables[2]).toMatchObject({ rows: [['Status codes', '2']] });
  });

  it('has each answer with its mark, correct answer, reason and feedback', () => {
    const blocks = resultBlocks(doc(marks));
    expect(facts(blocks, 'Your answer')).toEqual(['403 Forbidden', 'The controller']);
    expect(facts(blocks, 'Mark')).toEqual(['Wrong', 'Partly correct (AI marked)']);
    expect(facts(blocks, 'Correct answer')).toEqual([choice.answer, line.answer]);
    expect(facts(blocks, 'Reason')).toEqual([choice.why, line.why]);
    expect(facts(blocks, 'Feedback')).toEqual(['It leaves out the middleware.']);
  });

  it('says so when an answer was left blank or is not marked yet', () => {
    const blocks = resultBlocks({ ...doc({}), answers: {} });
    expect(facts(blocks, 'Your answer')).toEqual(['Not answered', 'Not answered']);
    expect(facts(blocks, 'Mark')).toEqual(['Not marked', 'Not marked']);
  });

  it('says when there are no weak points', () => {
    const right: Mark = { value: 'correct', by: 'browser', feedback: '' };
    const blocks = resultBlocks(doc({ c: right, l: right }));
    expect(blocks).toContainEqual({ kind: 'text', text: 'None.' });
  });
});

describe('the flow part', () => {
  const image = { dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 20 };

  it('has the image and the Mermaid code', () => {
    const blocks = flowBlocks('A flow', 'sequenceDiagram', image);
    expect(blocks).toContainEqual({ kind: 'image', alt: 'Diagram of A flow', ...image });
    expect(blocks).toContainEqual({ kind: 'code', language: 'mermaid', text: 'sequenceDiagram' });
  });

  it('says so when nothing was drawn', () => {
    const blocks = flowBlocks('A flow', 'sequenceDiagram', null);
    expect(blocks.some((block) => block.kind === 'image')).toBe(false);
    expect(texts(blocks)).toContain('was not drawn');
    expect(blocks).toContainEqual({ kind: 'code', language: 'mermaid', text: 'sequenceDiagram' });
  });
});
