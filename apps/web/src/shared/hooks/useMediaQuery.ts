import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => {
      setMatches(media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
    };
  }, [query]);
  return matches;
}

/** The phone layout: one column, controls behind the "more" menu. */
export const useIsNarrow = (): boolean => useMediaQuery('(max-width: 720px)');

export const useReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)');
