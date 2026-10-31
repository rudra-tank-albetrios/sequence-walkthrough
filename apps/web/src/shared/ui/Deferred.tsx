import { Suspense, useState, type ReactNode } from 'react';

/**
 * Mounts its children the first time `when` is true and keeps them mounted after that, so a lazy
 * dialog or panel is downloaded on its first use and then behaves like one mounted all along. The
 * budget (plan section 5) keeps the first load under 200 KB: everything behind a flag waits here.
 */
export function Deferred({ when, children }: { when: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(when);
  // Latches on the first true, as React allows for state derived during the render.
  if (when && !mounted) setMounted(true);
  return mounted || when ? <Suspense fallback={null}>{children}</Suspense> : null;
}
