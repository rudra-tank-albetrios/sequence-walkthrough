import { Suspense } from 'react';

import { TOOLS } from './registry.ts';

/** The tools with a dialog of their own stay mounted, waiting for their `ui` flag. */
export function ToolHosts() {
  return (
    <Suspense fallback={null}>
      {TOOLS.map((tool) => {
        const Host = tool.host;
        return Host ? <Host key={tool.id} /> : null;
      })}
    </Suspense>
  );
}
