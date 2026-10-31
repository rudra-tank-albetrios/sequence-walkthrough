import type { RefObject } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { MenuItem } from '../../shared/ui/Menu.tsx';
import { rememberOpener } from './overlayFocus.ts';
import { activate, toolsOf, type ToolGroupId } from './registry.ts';

/** One menu item per tool of a group, read from the registry. */
export function ToolMenuItems({ group, opener }: { group: ToolGroupId; opener: RefObject<HTMLElement | null> }) {
  const flow = useFlowStore((s) => s.flow);
  return toolsOf(group).map((tool) => {
    const Icon = tool.icon;
    const count = flow?.isSequence ? tool.count?.(flow) : undefined;
    const hint = count ? String(count) : tool.hint;
    return (
      <MenuItem
        key={tool.id}
        icon={<Icon size={15} />}
        tour={tool.tour}
        {...(hint ? { hint } : {})}
        onSelect={() => {
          rememberOpener(opener.current);
          activate(tool);
        }}
      >
        {tool.label}
      </MenuItem>
    );
  });
}
