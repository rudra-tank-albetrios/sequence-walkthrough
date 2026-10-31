/** The shapes the quiz works with, and the set-up choices the plan's section 8.9 lists. */

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
/** One level, or some of each. */
export type DifficultyChoice = Difficulty | 'all';

export const QUESTION_TYPES = ['choice', 'line', 'theory'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type TypeChoice = QuestionType | 'mix';

export const QUESTION_COUNTS = [5, 10, 15] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];

export const TIMER_MINUTES = [5, 10, 15] as const;

export type TimeMode = { kind: 'off' } | { kind: 'timer'; minutes: number } | { kind: 'stopwatch' };

export interface QuizConfig {
  difficulty: DifficultyChoice;
  count: QuestionCount;
  type: TypeChoice;
  time: TimeMode;
  /** "Retry my mistakes": ask only these topics. Empty for a normal quiz. */
  focus: string[];
}

export const DEFAULT_CONFIG: QuizConfig = {
  difficulty: 'easy',
  count: 5,
  type: 'mix',
  time: { kind: 'stopwatch' },
  focus: [],
};

/** Each level's focus, used as the list of topics a question can have. */
export const LEVELS: Record<Difficulty, { label: string; topics: readonly string[] }> = {
  easy: {
    label: 'Easy',
    topics: ['Layer order', 'Who calls whom', 'Method and path', 'Status codes'],
  },
  medium: {
    label: 'Medium',
    topics: ['What goes', 'What comes back', 'What each chapter does', 'Why a step exists'],
  },
  hard: {
    label: 'Hard',
    topics: ['What happens on failure', 'What the user receives', 'Why the order matters'],
  },
};

export const TYPE_LABELS: Record<QuestionType, string> = {
  choice: 'Multiple choice',
  line: 'One-line answer',
  theory: 'Short theory',
};

export interface Question {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  /** Index of the source step in `flow.steps`. Every question has one. */
  stepIndex: number;
  topic: string;
  text: string;
  /** The four choices of a multiple choice question; empty for a written one. */
  options: string[];
  /** The correct answer: the exact text of one option, or the model answer. */
  answer: string;
  why: string;
  /** Sample questions only: every group needs one of its words, for marking without a model. */
  keywords?: string[][];
}

export type MarkValue = 'correct' | 'partly' | 'wrong';

export const MARK_LABELS: Record<MarkValue, string> = {
  correct: 'Correct',
  partly: 'Partly correct',
  wrong: 'Wrong',
};

export interface Mark {
  value: MarkValue;
  /** `browser` used no tokens, `ai` is labelled "AI marked", `user` pressed "Mark as correct". */
  by: 'browser' | 'ai' | 'user';
  /** The marker's own short comment, when it has one. */
  feedback: string;
}

/** Where a quiz's questions come from. */
export type QuizSource = 'model' | 'sample';
