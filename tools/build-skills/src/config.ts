/** What the build knows about each skill. Their text lives in `skills/`. */
export interface SkillConfig {
  name: string;
  /** Phrases that must load this skill: in its description, and in no other skill's (plan 7.5). */
  triggers: readonly string[];
  /** Files from `skills/shared/references` this skill ships. */
  references: readonly string[];
  /** Whether the skill ships worked examples. The fast skill reads nothing in its folders. */
  examples: boolean;
  /** The bar its examples must pass: the detailed skill's own check is the strict one. */
  strictExamples: boolean;
}

export const SKILLS: readonly SkillConfig[] = [
  {
    name: 'seq-diagram',
    triggers: ['diagram this flow', 'how does X work', 'walk me through'],
    references: ['layer-naming.md'],
    examples: false,
    strictExamples: false,
  },
  {
    name: 'detailed-seq-diagram',
    triggers: ['detailed seq diagram', 'detailed flow', 'full detail'],
    references: ['annotation-spec.md', 'layer-naming.md', 'writing-guide.md'],
    examples: true,
    strictExamples: true,
  },
];

/** The kit's file name stays the same as version 2's, so links to the download keep working. */
export const KIT_NAME = 'sequence-walkthrough-skill-kit';
