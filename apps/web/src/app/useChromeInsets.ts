import { useLayoutEffect, type RefObject } from 'react';

import { useDiagramStore } from '../shared/state/diagramStore.ts';

/**
 * The diagram runs under the floating header and dock, so whatever must stay clear of them needs to
 * know how much they cover. This measures them and publishes the numbers two ways: as the CSS
 * variables `--chrome-top` and `--chrome-bottom` on the page, and in the diagram store for the camera.
 * `layout` is any value that changes when a part of the chrome comes or goes.
 */
export function useChromeInsets(root: RefObject<HTMLElement | null>, layout: string): void {
  useLayoutEffect(() => {
    const page = root.current;
    if (!page) return;
    const measure = () => {
      const box = page.getBoundingClientRect();
      const top = page.querySelector('[data-chrome="top"]')?.getBoundingClientRect().bottom ?? box.top;
      const bottom = page.querySelector('[data-chrome="bottom"]')?.getBoundingClientRect().top ?? box.bottom;
      const insets = { top: Math.round(top - box.top), bottom: Math.round(box.bottom - bottom) };
      const { insets: known, setInsets } = useDiagramStore.getState();
      if (known.top === insets.top && known.bottom === insets.bottom) return;
      page.style.setProperty('--chrome-top', `${String(insets.top)}px`);
      page.style.setProperty('--chrome-bottom', `${String(insets.bottom)}px`);
      setInsets(insets);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    for (const part of page.querySelectorAll('[data-chrome]')) observer.observe(part);
    return () => {
      observer.disconnect();
    };
  }, [root, layout]);
}
