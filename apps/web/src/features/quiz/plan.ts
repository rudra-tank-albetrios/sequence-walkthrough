import {
  DIFFICULTIES,
  QUESTION_TYPES,
  type Difficulty,
  type DifficultyChoice,
  type QuestionType,
  type QuizConfig,
  type TypeChoice,
} from './types.ts';

/** One place in a quiz: the level and the type the question there must have. */
export interface Slot {
  difficulty: Difficulty;
  type: QuestionType;
}

const levelsOf = (choice: DifficultyChoice): readonly Difficulty[] =>
  choice === 'all' ? DIFFICULTIES : [choice];

const typesOf = (choice: TypeChoice): readonly QuestionType[] =>
  choice === 'mix' ? QUESTION_TYPES : [choice];

/**
 * The quiz's places, in order. With every level and every type the pairs cycle through all nine
 * combinations, and any first part of the list stays balanced.
 */
export function planSlots(config: Pick<QuizConfig, 'difficulty' | 'type' | 'count'>): Slot[] {
  const levels = levelsOf(config.difficulty);
  const types = typesOf(config.type);
  return Array.from({ length: config.count }, (_, i) => ({
    difficulty: levels[i % levels.length] ?? 'easy',
    type: types[(i + Math.floor(i / levels.length)) % types.length] ?? 'choice',
  }));
}

/** Takes the first open place that fits and returns it, or null when none does. */
export function takeSlot(slots: Slot[], difficulty: Difficulty | null, type: QuestionType): Slot | null {
  const at = slots.findIndex(
    (slot) => slot.type === type && (difficulty === null || slot.difficulty === difficulty),
  );
  if (at < 0) return null;
  const [slot] = slots.splice(at, 1);
  return slot ?? null;
}
