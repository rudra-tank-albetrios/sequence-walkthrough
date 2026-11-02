import { parseFlow, type Flow, type Step } from '@swv/core';

import { keptFlows } from '../../shared/storage/flowHistory.ts';
import type { Question } from './types.ts';

/** More would split a short quiz too thinly, and each flow costs its own request. */
export const MAX_CONNECTED = 3;

export interface ConnectedFlow {
  id: string;
  flow: Flow;
}

/** The chosen kept flows, read again from their code. One that no longer reads is left out. */
export function connectedFlows(ids: readonly string[]): ConnectedFlow[] {
  const kept = keptFlows();
  return ids.slice(0, MAX_CONNECTED).flatMap((id) => {
    const entry = kept.find((candidate) => candidate.id === id);
    if (!entry) return [];
    try {
      const { flow } = parseFlow(entry.code);
      return flow.isSequence && flow.steps.length > 0 ? [{ id, flow }] : [];
    } catch {
      return [];
    }
  });
}

/** A step of a connected flow, placed after the steps before it. It keeps its own number. */
function moved(step: Step, stepOffset: number, sectionOffset: number): Step {
  return {
    ...step,
    idx: step.idx + stepOffset,
    section: step.section + sectionOffset,
    answers: step.answers >= 0 ? step.answers + stepOffset : step.answers,
    replies: step.replies.map((reply) => reply + stepOffset),
  };
}

export interface MergedQuiz {
  /** The flow on screen, then the connected flows' steps and chapters, for the results and exports. */
  flow: Flow;
  questions: Question[];
}

/** One flow's questions, as they came back. */
export interface FlowQuestions {
  /** Empty for the flow on screen. */
  id: string;
  flow: Flow;
  questions: readonly Question[];
}

/**
 * Puts the questions of several flows in one quiz. The flow on screen comes first and stays as it
 * is, so its steps keep their places and can still be opened from the results.
 */
export function mergeQuiz(base: Flow, parts: readonly FlowQuestions[]): MergedQuiz {
  const steps = [...base.steps];
  const sections = [...base.sections];
  const questions: Question[] = [];
  for (const { id, flow, questions: asked } of parts) {
    const connected = id !== '';
    const stepOffset = connected ? steps.length : 0;
    if (connected) {
      const sectionOffset = sections.length;
      steps.push(...flow.steps.map((step) => moved(step, stepOffset, sectionOffset)));
      sections.push(
        ...flow.sections.map((section) => ({
          ...section,
          idx: section.idx + sectionOffset,
          firstStep: section.firstStep + stepOffset,
          name: `${flow.title}: ${section.name}`,
        })),
      );
    }
    for (const question of asked) {
      questions.push({
        ...question,
        id: `q${questions.length + 1}`,
        stepIndex: question.stepIndex + stepOffset,
        ...(connected ? { from: { id, title: flow.title } } : {}),
      });
    }
  }
  return {
    flow: steps.length === base.steps.length ? base : { ...base, steps, sections },
    questions,
  };
}
