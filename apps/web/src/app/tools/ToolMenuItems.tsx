import type { ReactNode, RefObject } from 'react';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { MenuHeading, MenuItem, MenuRow, MenuRowItem, MenuSeparator } from '../../shared/ui/Menu.tsx';
import { rememberOpener } from './overlayFocus.ts';
import { activate, toolsOf, type Tool, type ToolGroupId } from './registry.ts';

/**
 * The menu items of a group, read from the registry: a heading where a section starts, the tools
 * that share a row side by side, and one item for every other tool.
 */
export function ToolMenuItems({ group, opener }: { group: ToolGroupId; opener: RefObject<HTMLElement | null> }) {
  const flow = useFlowStore((s) => s.flow);
  const tools = toolsOf(group);
  const select = (tool: Tool) => {
    rememberOpener(opener.current);
    activate(tool);
  };
  const items: ReactNode[] = [];
  let section: string | undefined;
  const rowsDone = new Set<string>();
  for (const tool of tools) {
    if (tool.section && tool.section !== section) {
      if (items.length > 0) items.push(<MenuSeparator key={`sep ${tool.section}`} />);
      items.push(<MenuHeading key={`head ${tool.section}`}>{tool.section}</MenuHeading>);
      section = tool.section;
    }
    if (tool.row) {
      const row = `${tool.section ?? ''} ${tool.row}`;
      if (rowsDone.has(row)) continue;
      rowsDone.add(row);
      items.push(
        <MenuRow key={`row ${row}`} label={tool.row}>
          {tools
            .filter((other) => other.row === tool.row && other.section === tool.section)
            .map((other) => (
              <MenuRowItem key={other.id} tour={other.tour} onSelect={() => { select(other); }}>
                {other.label}
              </MenuRowItem>
            ))}
        </MenuRow>,
      );
      continue;
    }
    const Icon = tool.icon;
    const count = flow?.isSequence ? tool.count?.(flow) : undefined;
    const hint = count ? String(count) : tool.hint;
    items.push(
      <MenuItem
        key={tool.id}
        icon={<Icon size={15} />}
        tour={tool.tour}
        {...(hint ? { hint } : {})}
        onSelect={() => { select(tool); }}
      >
        {tool.label}
      </MenuItem>,
    );
  }
  return <>{items}</>;
}
