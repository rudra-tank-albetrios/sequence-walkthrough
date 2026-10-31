import * as RadixMenu from '@radix-ui/react-dropdown-menu';

import { downloadSkillKit } from '../../shared/lib/files.ts';
import { copyTableMarkdown, saveTableCsv } from '../../shared/lib/tableActions.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { MenuHeading, MenuItem, MenuRow, MenuSeparator } from '../../shared/ui/Menu.tsx';
import styles from './export.module.css';
import * as act from './exportActions.ts';
import { openFilePicker, useExportUi } from './exportUi.ts';

const PNG_SCALES = [1, 2, 4] as const;

/** The body of the Export menu, in version 2's order. The top bar owns the menu itself. */
export function ExportMenuItems() {
  const setUi = useFlowStore((s) => s.setUi);
  const setPdfOpen = useExportUi((s) => s.setPdfOpen);
  return (
    <>
      <MenuHeading>Files named after the flow</MenuHeading>
      <MenuItem onSelect={() => setPdfOpen(true)} hint="pages, header repeated">
        PDF…
      </MenuItem>
      <MenuRow>
        <span className={styles.rowLabel}>PNG</span>
        {PNG_SCALES.map((scale) => (
          <RadixMenu.Item
            key={scale}
            className={styles.scale}
            onSelect={() => act.run(() => act.exportPng(scale))}
          >
            {scale}×
          </RadixMenu.Item>
        ))}
      </MenuRow>
      <MenuItem onSelect={() => act.run(act.exportSvg)} hint="vector">
        SVG
      </MenuItem>
      <MenuItem onSelect={() => act.run(act.exportStepImage)} hint="current view">
        Step image
      </MenuItem>
      <MenuItem onSelect={() => act.run(act.exportCode)} hint=".mmd">
        Code
      </MenuItem>
      <MenuItem onSelect={() => act.run(saveTableCsv)} hint=".csv">
        Step table
      </MenuItem>
      <MenuItem onSelect={() => act.run(copyTableMarkdown)}>Copy table as Markdown</MenuItem>
      <MenuSeparator />
      <MenuHeading>Share</MenuHeading>
      <MenuItem onSelect={() => act.run(act.openLive)} hint="new tab">
        Open in mermaid.live
      </MenuItem>
      <MenuItem onSelect={() => act.run(act.copyLiveLink)}>Copy mermaid.live link</MenuItem>
      <MenuItem onSelect={() => act.run(() => act.copyViewerLink(false))} hint="code in URL">
        Copy viewer link
      </MenuItem>
      <MenuItem onSelect={() => act.run(() => act.copyViewerLink(true))} hint="opens on the step">
        Copy link to this step
      </MenuItem>
      <MenuSeparator />
      <MenuHeading>Ask AI</MenuHeading>
      <MenuItem onSelect={() => setUi({ aiSettingsOpen: true })} hint="free tiers, Ollama, Claude">
        Provider and key…
      </MenuItem>
      <MenuSeparator />
      <MenuHeading>Skill for Claude</MenuHeading>
      <MenuItem onSelect={() => act.run(downloadSkillKit)} hint=".zip with setup guide">
        Download the skill
      </MenuItem>
      <MenuSeparator />
      <MenuHeading>Import</MenuHeading>
      <MenuItem onSelect={() => setUi({ importOpen: true })}>Paste a link or code…</MenuItem>
      <MenuItem onSelect={openFilePicker} hint=".mmd .md .txt">
        Open a file…
      </MenuItem>
    </>
  );
}
