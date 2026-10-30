import { DEFAULT_TITLE, type Flow } from '@swv/core';
import { useEffect } from 'react';

export const DEFAULT_TITLE_SUFFIX = 'Sequence Walkthrough';

/** `<flow title> · Sequence Walkthrough`, or just the product name for an untitled diagram. */
export function useDocumentTitle(flow: Flow | null): void {
  useEffect(() => {
    const title = flow?.title ?? DEFAULT_TITLE;
    document.title = title === DEFAULT_TITLE ? DEFAULT_TITLE_SUFFIX : `${title} · ${DEFAULT_TITLE_SUFFIX}`;
  }, [flow]);
}
