import { forwardRef } from 'react';

/**
 * The one component that writes raw markup to the page. The markup is Mermaid's output after
 * DOMPurify (see mermaid.ts), and the ESLint rule that blocks raw HTML elsewhere allows this file.
 */
export const DiagramSvg = forwardRef<HTMLDivElement, { svg: string; className: string }>(
  function DiagramSvg({ svg, className }, ref) {
    return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
  },
);
