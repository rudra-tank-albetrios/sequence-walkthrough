import type { FlowState } from '../../shared/state/flowStore.ts';

interface DemoUsageBar {
  model: string;
  usedPercent: number;
  /** The remaining amount, as the real usage bar writes it. */
  left: string;
}

/** Simulated usage shown inside the tour card only. It never reaches the real usage records. */
export interface DemoUsage {
  bars: DemoUsageBar[];
  /** The notice auto-switch gives when it moves a question to the next model. */
  notice: string;
}

/**
 * One stop of the guided tour. To add a stop, add one entry to `TOUR_STOPS`: mark the element with
 * `data-tour="<target>"` and name the store `ui` flags that open its feature, if it has any.
 */
export interface TourStop {
  id: string;
  title: string;
  body: string;
  /** The `data-tour` value of the element to point at. With none on screen, the card is centred. */
  target: string;
  /** Store `ui` flags that open the feature. The tour closes them again when it moves on. */
  open?: Partial<FlowState['ui']>;
  /** The step of the demo flow the stop needs on screen, counted from 0. */
  step?: number;
  demoUsage?: DemoUsage;
}

export const TOUR_STOPS: readonly TourStop[] = [
  {
    id: 'layers',
    title: 'One request, every layer',
    body: 'Each column is a layer of the real demo store, from the shopper to the mail service. Arrows are numbered in the order the code runs, and clicking one opens its step.',
    target: 'layers',
  },
  {
    id: 'voice',
    title: 'Listen while it plays',
    body: 'Press Play and each step is read aloud, with the next one waiting for the voice to finish. The speaker icon mutes only the voice. Voices come from your device, so no key is needed.',
    target: 'voice',
  },
  {
    id: 'flow-rail',
    title: 'The Flow Rail',
    body: 'The whole flow on one line, split into chapter colours, with markers for errors, side parts, threats and bookmarks. Hover to preview a step and click to jump there.',
    target: 'flow-rail',
  },
  {
    id: 'side-parts',
    title: 'Side parts',
    body: 'Crons, hooks, utils and config values help a step without being a layer. Each one shows its purpose, its file and line, and the steps that use it.',
    target: 'side-parts',
    step: 0,
  },
  {
    id: 'ask-ai',
    title: 'Ask AI about a step',
    body: 'Ask anything about the step on screen with your own free key. Nothing is sent until you ask, and this tour never calls a model.',
    target: 'ask-panel',
    open: { askOpen: true },
    step: 0,
  },
  {
    id: 'usage',
    title: 'Usage and auto-switch',
    body: 'One bar per model shows how much of its limit is used. When a model runs low, the next question moves to your next model and a short notice says so.',
    target: 'usage',
    demoUsage: {
      bars: [
        { model: 'Groq', usedPercent: 96, left: '40 of 1,000 requests left' },
        { model: 'Gemini', usedPercent: 12, left: '440 of 500 requests left' },
      ],
      notice: 'Groq limit reached, switched to Gemini',
    },
  },
  {
    id: 'quiz',
    title: 'Test yourself',
    body: 'Questions come only from the flow on screen, and each one links to its step. This demo has a built-in sample quiz, so it works with no key.',
    target: 'tools-learn',
  },
  {
    id: 'recap',
    title: 'Quick day recap',
    body: 'Your mistakes stay in this browser. The recap lists each one with the right answer, by day or for all time, and you can retry them.',
    target: 'tools-learn',
  },
  {
    id: 'review',
    title: 'Structure review and threats',
    body: 'A rating of how well this flow follows its layers, with a confidence level, plus possible threats. The threat in this demo is a labelled sample. This is not a security audit.',
    target: 'tools-analyze',
  },
  {
    id: 'exports',
    title: 'Take it with you',
    body: 'Export the diagram as an image, PDF, Markdown or Mermaid, or share it as a link. That is the whole tour: press the arrow keys or click an arrow to start walking.',
    target: 'tools-export',
  },
];
