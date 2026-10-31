import type { Flow } from '@swv/core';
import {
  BookOpen,
  Compass,
  Database,
  GraduationCap,
  HardDrive,
  KeyRound,
  Keyboard,
  Layers,
  Palette,
  Puzzle,
  Route,
  ScanSearch,
  Share2,
  SlidersHorizontal,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { insightCount } from '../../features/insight/index.ts';
import { useFlowStore, type FlowState } from '../../shared/state/flowStore.ts';

/**
 * Every tool of the header's four groups, as data. The header menus, the phone menu, the overlay's
 * tabs and the guided tour all read this list, so a new tool is one more line in `TOOLS`:
 *
 *   A panel, shown in the big overlay:
 *     { id: 'quiz', group: 'learn', label: 'Quiz', icon: ListChecks, tour: 'tool-quiz',
 *       panel: onDemand(() => import('../../features/quiz/index.ts'), (m) => m.QuizPanel) },
 *
 *   A tool with its own dialog, opened through a `ui` flag and mounted once for the page:
 *     { id: 'recap', group: 'learn', label: 'Day recap', icon: CalendarCheck, tour: 'tool-recap',
 *       host: onDemand(() => import('../../features/recap/index.ts'), (m) => m.RecapDialog),
 *       run: setUi({ recapOpen: true }) },
 */
export type ToolGroupId = 'learn' | 'analyze' | 'export' | 'settings';

export interface ToolGroup {
  id: ToolGroupId;
  label: string;
  icon: LucideIcon;
  /** The guided tour finds the group's button through `data-tour="<tour>"`. */
  tour: string;
  /** What screen readers call the menu. */
  menuLabel: string;
}

interface ToolBase {
  /** Also the value of `ui.overlayTool`, so another feature can open the tool from the store. */
  id: string;
  group: ToolGroupId;
  label: string;
  icon: LucideIcon;
  /** The guided tour finds the tool through `data-tour="<tour>"`, on its menu item and overlay tab. */
  tour: string;
  /** Grey text at the right of the menu item. */
  hint?: string;
  /** The small number beside the name, such as how many layers the flow has. */
  count?: (flow: Flow) => number;
  /** Mounted once for the whole page, for a tool that lives in its own dialog. */
  host?: LazyExoticComponent<ComponentType>;
}

export type Tool = ToolBase & ({ panel: LazyExoticComponent<ComponentType> } | { run: () => void });

/** A component that is downloaded only when it is first shown, so it stays out of the first load. */
export const onDemand = <M>(load: () => Promise<M>, pick: (module: M) => ComponentType) =>
  lazy(async () => ({ default: pick(await load()) }));

/** A tool's action that only raises a `ui` flag in the store. */
const setUi = (patch: Partial<FlowState['ui']>) => () => {
  useFlowStore.getState().setUi(patch);
};

const insight = () => import('../../features/insight/InsightPane.tsx');
const settings = () => import('../../features/settings/index.ts');

export const GROUPS: readonly ToolGroup[] = [
  { id: 'learn', label: 'Learn', icon: GraduationCap, tour: 'tools-learn', menuLabel: 'Learn' },
  { id: 'analyze', label: 'Analyze', icon: ScanSearch, tour: 'tools-analyze', menuLabel: 'Analyze' },
  { id: 'export', label: 'Export', icon: Share2, tour: 'tools-export', menuLabel: 'Export and share' },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal, tour: 'tools-settings', menuLabel: 'Settings' },
];

export const TOOLS: readonly Tool[] = [
  { id: 'glossary', group: 'learn', label: 'Glossary', icon: BookOpen, tour: 'tool-glossary', count: (f) => insightCount(f, 'glossary'), panel: onDemand(insight, (m) => m.GlossaryPane) },
  { id: 'guide', group: 'learn', label: 'How it works', icon: Compass, tour: 'tool-guide', run: setUi({ guideOpen: true }) },
  { id: 'shortcuts', group: 'learn', label: 'Shortcuts and help', icon: Keyboard, tour: 'tool-shortcuts', hint: '?', run: setUi({ shortcutsOpen: true }) },

  { id: 'layers', group: 'analyze', label: 'Layers', icon: Layers, tour: 'tool-layers', count: (f) => insightCount(f, 'layers'), panel: onDemand(insight, (m) => m.LayersPane) },
  { id: 'endpoints', group: 'analyze', label: 'Endpoints', icon: Route, tour: 'tool-endpoints', count: (f) => insightCount(f, 'endpoints'), panel: onDemand(insight, (m) => m.EndpointsPane) },
  { id: 'errors', group: 'analyze', label: 'Errors', icon: TriangleAlert, tour: 'tool-errors', count: (f) => insightCount(f, 'errors'), panel: onDemand(insight, (m) => m.ErrorsPane) },
  { id: 'data', group: 'analyze', label: 'Data', icon: Database, tour: 'tool-data', count: (f) => insightCount(f, 'data'), panel: onDemand(insight, (m) => m.DataPane) },
  { id: 'side-parts', group: 'analyze', label: 'Side parts', icon: Puzzle, tour: 'tool-side-parts', count: (f) => insightCount(f, 'behind'), panel: onDemand(insight, (m) => m.BehindPane) },

  { id: 'theme', group: 'settings', label: 'Theme and display', icon: Palette, tour: 'tool-theme', panel: onDemand(settings, (m) => m.AppearancePane) },
  { id: 'models', group: 'settings', label: 'Models and keys', icon: KeyRound, tour: 'tool-models', run: setUi({ aiSettingsOpen: true }) },
  { id: 'stored-data', group: 'settings', label: 'Stored data', icon: HardDrive, tour: 'tool-stored-data', panel: onDemand(settings, (m) => m.StoredDataPane) },
];

export const toolsOf = (group: ToolGroupId): Tool[] => TOOLS.filter((tool) => tool.group === group);

export const findTool = (id: string | null): Tool | undefined => TOOLS.find((tool) => tool.id === id);

/** Opens a tool: its panel in the overlay, or whatever its action does. */
export function activate(tool: Tool): void {
  if ('run' in tool) tool.run();
  else useFlowStore.getState().setUi({ overlayTool: tool.id });
}
