import { useMemo } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { allTerms, termRegex, useGlossaryStore, type GlossaryEntry } from '../../shared/state/glossaryStore.ts';

export interface Glossary {
  regex: RegExp | null;
  lookup: (word: string) => GlossaryEntry | undefined;
}

/** The flow's terms plus the saved ones, with a matcher, recomputed only when either changes. */
export function useGlossary(): Glossary {
  const flow = useFlowStore((s) => s.flow);
  const saved = useGlossaryStore((s) => s.saved);
  return useMemo(() => {
    const terms = allTerms(flow, saved);
    const byWord = new Map(terms.map((t) => [t.term.toLowerCase(), t]));
    return {
      regex: termRegex(terms),
      lookup: (word: string) => byWord.get(word.toLowerCase()),
    };
  }, [flow, saved]);
}
