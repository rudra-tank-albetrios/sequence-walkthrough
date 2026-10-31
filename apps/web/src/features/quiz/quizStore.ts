import type { Flow } from '@swv/core';
import { create } from 'zustand';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { flowId } from '../../shared/storage/notes.ts';
import {
  loadWeakPoints,
  recordCorrect,
  recordMiss,
  takeQuizRetry,
  weakTopics,
  type QuizRetry,
} from '../../shared/storage/weakPoints.ts';
import { generateQuestions, QuizError } from './generate.ts';
import { chapterOf, markWritten, marksFor, type Answers, type Marks } from './marking.ts';
import { loadRecentQuestions, rememberQuestions } from './recent.ts';
import { pickSample } from './sample/index.ts';
import { DEFAULT_CONFIG, type Question, type QuizConfig, type QuizSource } from './types.ts';

export type Phase = 'setup' | 'loading' | 'running' | 'result' | 'error';

export interface QuizState {
  phase: Phase;
  config: QuizConfig;
  source: QuizSource;
  /** The flow the quiz is about, as it was when the quiz started. */
  flow: Flow | null;
  questions: Question[];
  answers: Answers;
  marks: Marks;
  /** The written answers are with the model, or could not be marked. */
  marking: 'idle' | 'busy' | 'failed';
  markingProblem: string | null;
  startedAt: number;
  finishedAt: number;
  /** The timer reached zero and submitted the quiz. */
  autoSubmitted: boolean;
  error: string | null;
  /** "Retry my mistakes" from the recap, until the quiz starts. */
  retry: QuizRetry | null;
  /** What happened to the last attempt to start, shown on the set-up screen. */
  notice: string | null;

  /** Picks up a pending "Retry my mistakes" as the quiz opens; a stale result or flow is dropped. */
  prepare: () => void;
  dropRetry: () => void;
  start: (config: QuizConfig, source: QuizSource) => Promise<void>;
  /** Stops writing a quiz, or leaves a running one, without keeping anything. */
  leave: () => void;
  answer: (questionId: string, text: string) => void;
  /** Ends the quiz once: a second call, from the button or the timer, does nothing. */
  submit: (auto?: boolean) => void;
  markAsCorrect: (questionId: string) => void;
  retryMarking: () => void;
  backToSetup: () => void;
}

const EMPTY_SESSION = {
  flow: null,
  questions: [],
  answers: {},
  marks: {},
  marking: 'idle',
  markingProblem: null,
  startedAt: 0,
  finishedAt: 0,
  autoSubmitted: false,
  error: null,
  notice: null,
} satisfies Partial<QuizState>;

/** The request that is writing a quiz or marking answers. A newer action aborts it. */
let active: AbortController | null = null;

function newRequest(): AbortController {
  active?.abort();
  active = new AbortController();
  return active;
}

/** What each question has already added to the weak points, so nothing is counted twice. */
let saved = new Map<string, 'miss' | 'correct'>();

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useQuizStore = create<QuizState>((set, get) => {
  /** Writes the marks that are new to the weak points. */
  const saveOutcomes = (): void => {
    const { flow, questions, answers, marks } = get();
    if (!flow) return;
    const id = flowId(flow);
    for (const question of questions) {
      const mark = marks[question.id];
      if (!mark || saved.has(question.id)) continue;
      if (mark.value === 'correct') {
        saved.set(question.id, 'correct');
        void recordCorrect({ flowId: id, topic: question.topic, question: question.text });
      } else {
        saved.set(question.id, 'miss');
        void recordMiss({
          flowId: id,
          flow: flow.title,
          step: flow.steps[question.stepIndex]?.n ?? 1,
          chapter: chapterOf(flow, question),
          topic: question.topic,
          question: question.text,
          userAnswer: answers[question.id] ?? '',
          correctAnswer: question.answer,
          whyWrong: mark.feedback && mark.by === 'ai' ? mark.feedback : question.why,
        });
      }
    }
  };

  /** Sends the written answers the browser could not mark, in one request. */
  const markWithModel = async (): Promise<void> => {
    const { questions, answers, marks } = get();
    const items = questions
      .filter((question) => !marks[question.id])
      .map((question) => ({ question, answer: answers[question.id] ?? '' }));
    if (items.length === 0) return;
    const request = newRequest();
    set({ marking: 'busy', markingProblem: null });
    const outcome = await markWritten(items, request.signal);
    if (request.signal.aborted) return;
    set((s) => ({
      // A choice the user already made stands.
      marks: { ...outcome.marks, ...s.marks },
      marking: outcome.problem ? 'failed' : 'idle',
      markingProblem: outcome.problem,
    }));
    saveOutcomes();
  };

  return {
    phase: 'setup',
    config: DEFAULT_CONFIG,
    source: 'sample',
    retry: null,
    ...EMPTY_SESSION,

    prepare() {
      const { flow, phase } = get();
      const retry = takeQuizRetry();
      const stale = flow !== null && flow !== useFlowStore.getState().flow;
      if (retry || (stale && phase !== 'running')) {
        newRequest();
        set({ phase: 'setup', ...EMPTY_SESSION, ...(retry ? { retry } : {}) });
      }
    },

    dropRetry() {
      set({ retry: null });
    },

    async start(config, source) {
      const { flow } = useFlowStore.getState();
      if (!flow?.isSequence || get().phase === 'loading') return;
      const request = newRequest();
      saved = new Map();
      set({ ...EMPTY_SESSION, phase: 'loading', config, source, flow });
      const id = flowId(flow);
      try {
        const [points, recent] = await Promise.all([loadWeakPoints(), loadRecentQuestions(id)]);
        const weak = weakTopics(points, id);
        const questions =
          source === 'sample'
            ? pickSample(flow, config, { weak, recent })
            : await generateQuestions({
                flow,
                config,
                avoid: recent,
                weak,
                signal: request.signal,
              });
        if (request.signal.aborted) return;
        if (questions.length === 0) {
          throw new QuizError('The built-in sample has no questions on these topics.');
        }
        void rememberQuestions(
          id,
          questions.map((question) => question.text),
        );
        set({ phase: 'running', questions, startedAt: Date.now(), retry: null });
      } catch (error) {
        if (request.signal.aborted) return;
        if (error instanceof QuizError && error.needsSettings) {
          set({ phase: 'setup', notice: error.message });
          useFlowStore.getState().setUi({ aiSettingsOpen: true });
          return;
        }
        set({ phase: 'error', error: messageOf(error) });
      }
    },

    leave() {
      newRequest();
      set({ phase: 'setup', ...EMPTY_SESSION });
    },

    answer(questionId, text) {
      if (get().phase !== 'running') return;
      set((s) => ({ answers: { ...s.answers, [questionId]: text } }));
    },

    submit(auto = false) {
      const { phase, questions, answers } = get();
      if (phase !== 'running') return;
      set({
        phase: 'result',
        finishedAt: Date.now(),
        autoSubmitted: auto,
        marks: marksFor(questions, answers),
      });
      saveOutcomes();
      void markWithModel();
    },

    markAsCorrect(questionId) {
      const { flow, phase, questions, marks } = get();
      const question = questions.find((candidate) => candidate.id === questionId);
      if (phase !== 'result' || !flow || !question || question.type === 'choice') return;
      if (marks[questionId]?.value === 'correct') return;
      set((s) => ({
        marks: { ...s.marks, [questionId]: { value: 'correct', by: 'user', feedback: '' } },
      }));
      // Takes back the miss this answer added, or counts as a correct answer if none was saved yet.
      saved.set(questionId, 'correct');
      void recordCorrect({ flowId: flowId(flow), topic: question.topic, question: question.text });
    },

    retryMarking() {
      if (get().marking !== 'failed') return;
      void markWithModel();
    },

    backToSetup() {
      newRequest();
      set({ phase: 'setup', ...EMPTY_SESSION });
    },
  };
});
