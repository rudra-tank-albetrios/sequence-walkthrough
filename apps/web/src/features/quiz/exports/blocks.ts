import type { Flow } from '@swv/core';

import { plural } from '../../../shared/lib/util.ts';
import { route } from '../../../shared/storage/notes.ts';
import { timeLine } from '../clock.ts';
import {
  markerLabel,
  scoreLine,
  scoreQuiz,
  scoreRowText,
  weakFound,
  type Answers,
  type Marks,
  type ScoreRow,
} from '../marking.ts';
import { LEVELS, MARK_LABELS, TYPE_LABELS, type Mark, type Question, type TimeMode } from '../types.ts';

/** A download's contents, before they become Markdown or a PDF. */
export type DocBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'question'; number: number; text: string; meta: string }
  | { kind: 'option'; text: string; correct: boolean }
  | { kind: 'fact'; label: string; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'image'; alt: string; dataUrl: string; width: number; height: number }
  | { kind: 'code'; language: string; text: string };

export interface QuizDoc {
  flow: Flow;
  questions: readonly Question[];
}

export interface ResultDoc extends QuizDoc {
  answers: Answers;
  marks: Marks;
  time: TimeMode;
  startedAt: number;
  finishedAt: number;
  autoSubmitted: boolean;
}

export interface DiagramImage {
  dataUrl: string;
  width: number;
  height: number;
}

function questionBlock(flow: Flow, question: Question, index: number): DocBlock {
  const step = flow.steps[question.stepIndex];
  const where = step ? `Step ${step.n}: ${route(step)}` : '';
  const meta = [where, TYPE_LABELS[question.type], LEVELS[question.difficulty].label];
  return { kind: 'question', number: index + 1, text: question.text, meta: meta.filter(Boolean).join('. ') };
}

/** The questions, with or without their answers and reasons. */
export function quizBlocks({ flow, questions }: QuizDoc, withAnswers: boolean): DocBlock[] {
  const blocks: DocBlock[] = [
    { kind: 'title', text: `${flow.title}: quiz` },
    {
      kind: 'text',
      text: `${plural(questions.length, 'question')}, ${withAnswers ? 'with' : 'without'} answers. Each one comes from a step of this flow.`,
    },
  ];
  questions.forEach((question, index) => {
    blocks.push(questionBlock(flow, question, index));
    for (const option of question.options) {
      blocks.push({ kind: 'option', text: option, correct: withAnswers && option === question.answer });
    }
    if (withAnswers) {
      blocks.push(
        { kind: 'fact', label: 'Correct answer', text: question.answer },
        { kind: 'fact', label: 'Reason', text: question.why },
      );
    }
  });
  return blocks;
}

function markText(question: Question, mark: Mark | undefined): string {
  if (!mark) return 'Not marked';
  const marker = markerLabel(question, mark);
  return marker ? `${MARK_LABELS[mark.value]} (${marker})` : MARK_LABELS[mark.value];
}

const scoreTable = (head: string, rows: readonly ScoreRow[]): DocBlock => ({
  kind: 'table',
  head: [head, 'Score'],
  rows: rows.map((row) => [row.label, scoreRowText(row)]),
});

/** Score, time, the scores per chapter and level, every answer with its feedback, weak points. */
export function resultBlocks(doc: ResultDoc): DocBlock[] {
  const { flow, questions, answers, marks } = doc;
  const score = scoreQuiz(flow, questions, marks);
  const weak = weakFound(questions, marks);
  const blocks: DocBlock[] = [
    { kind: 'title', text: `${flow.title}: quiz result` },
    { kind: 'text', text: scoreLine(score) },
    { kind: 'text', text: timeLine(doc.time, doc.startedAt, doc.finishedAt, doc.autoSubmitted) },
    { kind: 'heading', text: 'Score per chapter' },
    scoreTable('Chapter', score.chapters),
    { kind: 'heading', text: 'Score per difficulty' },
    scoreTable('Difficulty', score.levels),
    { kind: 'heading', text: 'Weak points found' },
    weak.length > 0
      ? {
          kind: 'table',
          head: ['Topic', 'Answers that fell short'],
          rows: weak.map(({ topic, count }) => [topic, String(count)]),
        }
      : { kind: 'text', text: 'None.' },
    { kind: 'heading', text: 'Questions and answers' },
  ];
  questions.forEach((question, index) => {
    const mark = marks[question.id];
    blocks.push(
      questionBlock(flow, question, index),
      { kind: 'fact', label: 'Your answer', text: (answers[question.id] ?? '').trim() || 'Not answered' },
      { kind: 'fact', label: 'Mark', text: markText(question, mark) },
      { kind: 'fact', label: 'Correct answer', text: question.answer },
      { kind: 'fact', label: 'Reason', text: question.why },
    );
    if (mark?.by === 'ai' && mark.feedback) {
      blocks.push({ kind: 'fact', label: 'Feedback', text: mark.feedback });
    }
  });
  return blocks;
}

/** The diagram image and its Mermaid code. No image when nothing was drawn when the file was made. */
export function flowBlocks(title: string, code: string, image: DiagramImage | null): DocBlock[] {
  const blocks: DocBlock[] = [
    { kind: 'heading', text: 'The flow' },
    {
      kind: 'text',
      text: image
        ? 'The diagram and its Mermaid code, as they were on screen.'
        : 'The diagram was not drawn when this file was made, so only its Mermaid code is here.',
    },
  ];
  if (image) blocks.push({ kind: 'image', alt: `Diagram of ${title}`, ...image });
  blocks.push({ kind: 'heading', text: 'Mermaid code' }, { kind: 'code', language: 'mermaid', text: code });
  return blocks;
}
