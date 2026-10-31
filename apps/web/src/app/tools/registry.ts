import type { Flow } from '@swv/core';
import {
  BookOpen,
  Camera,
  ClipboardCopy,
  ClipboardPaste,
  Compass,
  Database,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  FolderOpen,
  GraduationCap,
  HardDrive,
  Image,
  KeyRound,
  Keyboard,
  Layers,
  Link,
  Link2,
  Palette,
  Puzzle,
  Route,
  ScanSearch,
  Shapes,
  Share2,
  SlidersHorizontal,
  Table,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { exportActions as act, openFilePicker, useExportUi } from '../../features/export/index.ts';
import { insightCount } from '../../features/insight/index.ts';
import { downloadSkillKit } from '../../shared/lib/files.ts';
import { copyTableMarkdown, saveTableCsv } from '../../shared/lib/tableActions.ts';
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
 *
 *   An export, under the heading it belongs to in the Export menu:
 *     { id: 'quiz-export', group: 'export', section: 'Files named after the flow', label: 'Quiz',
 *       hint: '.md', icon: ListChecks, tour: 'tool-quiz-export', run: () => act.run(exportQuiz) },
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
  /** The heading the item sits under in its group's menu; items of one section stay together. */
  section?: string;
  /** Items with the same row label sit side by side on one compact line, such as the PNG scales. */
  row?: string;
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
const FILES = 'Files named after the flow';

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

  // The Export menu, in version 2's order (docs/parity.md F19)
  { id: 'pdf', group: 'export', section: FILES, label: 'PDF…', hint: 'pages, header repeated', icon: FileText, tour: 'tool-pdf', run: () => { useExportUi.getState().setPdfOpen(true); } },
  { id: 'png-1', group: 'export', section: FILES, row: 'PNG', label: '1×', icon: Image, tour: 'tool-png', run: () => { act.run(() => act.exportPng(1)); } },
  { id: 'png-2', group: 'export', section: FILES, row: 'PNG', label: '2×', icon: Image, tour: 'tool-png-2', run: () => { act.run(() => act.exportPng(2)); } },
  { id: 'png-4', group: 'export', section: FILES, row: 'PNG', label: '4×', icon: Image, tour: 'tool-png-4', run: () => { act.run(() => act.exportPng(4)); } },
  { id: 'svg', group: 'export', section: FILES, label: 'SVG', hint: 'vector', icon: Shapes, tour: 'tool-svg', run: () => { act.run(act.exportSvg); } },
  { id: 'step-image', group: 'export', section: FILES, label: 'Step image', hint: 'current view', icon: Camera, tour: 'tool-step-image', run: () => { act.run(act.exportStepImage); } },
  { id: 'code', group: 'export', section: FILES, label: 'Code', hint: '.mmd', icon: FileCode, tour: 'tool-code', run: () => { act.run(act.exportCode); } },
  { id: 'step-table', group: 'export', section: FILES, label: 'Step table', hint: '.csv', icon: Table, tour: 'tool-step-table', run: () => { act.run(saveTableCsv); } },
  { id: 'table-markdown', group: 'export', section: FILES, label: 'Copy table as Markdown', icon: ClipboardCopy, tour: 'tool-table-markdown', run: () => { act.run(copyTableMarkdown); } },
  { id: 'open-live', group: 'export', section: 'Share', label: 'Open in mermaid.live', hint: 'new tab', icon: ExternalLink, tour: 'tool-open-live', run: () => { act.run(act.openLive); } },
  { id: 'live-link', group: 'export', section: 'Share', label: 'Copy mermaid.live link', icon: Link, tour: 'tool-live-link', run: () => { act.run(act.copyLiveLink); } },
  { id: 'viewer-link', group: 'export', section: 'Share', label: 'Copy viewer link', hint: 'code in URL', icon: Link2, tour: 'tool-viewer-link', run: () => { act.run(() => act.copyViewerLink(false)); } },
  { id: 'step-link', group: 'export', section: 'Share', label: 'Copy link to this step', hint: 'opens on the step', icon: Link2, tour: 'tool-step-link', run: () => { act.run(() => act.copyViewerLink(true)); } },
  { id: 'provider', group: 'export', section: 'Ask AI', label: 'Provider and key…', hint: 'free tiers, Ollama, Claude', icon: KeyRound, tour: 'tool-provider', run: setUi({ aiSettingsOpen: true }) },
  { id: 'skill', group: 'export', section: 'Skill for Claude', label: 'Download the skill', hint: '.zip with setup guide', icon: Download, tour: 'tool-skill', run: () => { act.run(downloadSkillKit); } },
  { id: 'import', group: 'export', section: 'Import', label: 'Paste a link or code…', icon: ClipboardPaste, tour: 'tool-import', run: setUi({ importOpen: true }) },
  { id: 'open-file', group: 'export', section: 'Import', label: 'Open a file…', hint: '.mmd .md .txt', icon: FolderOpen, tour: 'tool-open-file', run: openFilePicker },

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
