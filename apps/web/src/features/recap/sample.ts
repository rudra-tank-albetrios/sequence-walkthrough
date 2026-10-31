import type { Flow } from '@swv/core';

import { DEFAULT_DIAGRAM } from '../../shared/lib/defaultDiagram.ts';
import { flowId } from '../../shared/storage/notes.ts';
import type { WeakPoint } from '../../shared/storage/weakPoints.ts';
import type { AnalysisGroup } from './analysis.ts';

const normal = (code: string): string => code.replace(/\r\n/g, '\n').trim();

/** The demo flow, unedited: the sample's steps and answers are true only for this code. */
export const isDemoFlow = (code: string): boolean => normal(code) === normal(DEFAULT_DIAGRAM);

type SampleMistake = Omit<WeakPoint, 'flowId' | 'flow' | 'date'> & {
  /** How long ago it was missed, so every period has something to show. */
  daysAgo: number;
};

const MISTAKES: readonly SampleMistake[] = [
  {
    id: 'sample-holds',
    step: 18,
    chapter: 'Reserve stock',
    topic: 'Stock holds',
    question: 'Why is stock held in Redis before the order is saved?',
    userAnswer: 'So the order can be read faster later.',
    whyWrong: 'The hold is there to stop overselling. It has nothing to do with reading the order.',
    correctAnswer:
      'So two shoppers cannot buy the last item. The hold has a TTL, so an abandoned order gives the stock back on its own.',
    timesMissed: 2,
    daysAgo: 0,
  },
  {
    id: 'sample-validation',
    step: 14,
    chapter: 'Check the request',
    topic: 'Validation errors',
    question: 'What does the shopper get back when the request body is invalid?',
    userAnswer: 'A 400 with the first problem found.',
    whyWrong: 'The validator does not stop at the first problem, and this route answers with 422.',
    correctAnswer: '422 Unprocessable Entity with the full list of field problems.',
    timesMissed: 1,
    daysAgo: 0,
  },
  {
    id: 'sample-release',
    step: 21,
    chapter: 'Reserve stock',
    topic: 'Failure replies',
    question: 'What happens to the earlier holds when a later line is out of stock?',
    userAnswer: 'They stay until their TTL ends.',
    whyWrong:
      'The TTL covers crashes and abandoned orders. This failure is known, so it is handled at once.',
    correctAnswer:
      'The service gives the earlier holds back and stops with OutOfStockError, which becomes a 409.',
    timesMissed: 1,
    daysAgo: 3,
  },
  {
    id: 'sample-transaction',
    step: 24,
    chapter: 'Save the order',
    topic: 'Transactions',
    question: 'Why are the order and its items written in one transaction?',
    userAnswer: 'Because every database insert needs a transaction.',
    whyWrong: 'Nothing forces it. The transaction is a choice that protects the data.',
    correctAnswer: 'So a failure leaves no half-saved order.',
    timesMissed: 1,
    daysAgo: 5,
  },
  {
    id: 'sample-email',
    step: 27,
    chapter: 'Save the order',
    topic: 'Background work',
    question: 'Does the reply to the shopper wait for the confirmation email?',
    userAnswer: 'Yes, the controller waits until the email is sent.',
    whyWrong: 'The service only publishes order.placed. A worker sends the email later.',
    correctAnswer:
      'No. Nothing in this request waits for the email, so the reply is not slowed down.',
    timesMissed: 3,
    daysAgo: 20,
  },
];

const GROUPS: readonly AnalysisGroup[] = [
  {
    title: 'Holds protect the stock',
    points: [
      'A hold stops two shoppers buying the last item, and has nothing to do with reading speed.',
      'The TTL is the safety net for abandoned orders. A known failure gives holds back at once.',
    ],
    mistakeIds: ['sample-holds', 'sample-release'],
  },
  {
    title: 'What a failure sends back',
    points: [
      'A bad body gets a 422 listing every problem, so the form can mark them all.',
      'A shortage becomes a 409 only after the earlier holds are returned.',
    ],
    mistakeIds: ['sample-validation', 'sample-release'],
  },
  {
    title: 'What the request waits for',
    points: [
      'The order and its items are saved in one transaction, so nothing is half saved.',
      'The email never holds up the reply: an event queues a job, and a worker sends it.',
    ],
    mistakeIds: ['sample-transaction', 'sample-email'],
  },
];

export interface SampleRecap {
  mistakes: WeakPoint[];
  groups: readonly AnalysisGroup[];
}

/** The built-in recap for the demo flow, dated from today. It needs no model and no quiz. */
export function sampleRecap(flow: Flow, now: Date): SampleRecap {
  const mistakes = MISTAKES.map(({ daysAgo, ...mistake }) => ({
    ...mistake,
    flowId: flowId(flow),
    flow: flow.title,
    date: new Date(new Date(now).setDate(now.getDate() - daysAgo)).toISOString(),
  }));
  return { mistakes, groups: GROUPS };
}
