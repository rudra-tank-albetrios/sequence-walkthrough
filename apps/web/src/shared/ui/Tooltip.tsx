import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

import styles from './Tooltip.module.css';

/** Wrap the app once; every Tooltip below shares the delay. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={400}>{children}</RadixTooltip.Provider>;
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/** A short hover and focus hint on a control. The child must accept a ref. */
export function Tooltip({ content, children, side = 'bottom' }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className={styles.tip} side={side} sideOffset={6}>
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
