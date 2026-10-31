import { useState } from 'react';

import { downloadSkillKit } from '../../shared/lib/files.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { Kbd } from '../../shared/ui/Kbd.tsx';
import styles from './guide.module.css';

const Mono = ({ children }: { children: string }) => <code className="mono">{children}</code>;

/** "How it works": the viewer in a few points, the Claude skill's setup and use, and the kit download. */
export function GuideDialog() {
  const open = useFlowStore((s) => s.ui.guideOpen);
  const setUi = useFlowStore((s) => s.setUi);
  const [busy, setBusy] = useState(false);
  const close = () => setUi({ guideOpen: false });

  const download = async () => {
    setBusy(true);
    await downloadSkillKit();
    setBusy(false);
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="How it works"
      description="What the viewer shows, how to set up the Claude skill once, and how to use it."
      actions={
        <>
          <Button onClick={() => setUi({ guideOpen: false, shortcutsOpen: true })}>Shortcuts</Button>
          <Button onClick={close}>Close</Button>
          <Button variant="primary" autoFocus disabled={busy} onClick={() => void download()}>
            Download the skill
          </Button>
        </>
      }
    >
      <h3 className={styles.h3}>The viewer</h3>
      <ul className={styles.points}>
        <li>
          Paste Mermaid <Mono>sequenceDiagram</Mono> code in the code panel (<Kbd>C</Kbd>), or use Export → Paste a
          link or code / Open a file.
        </li>
        <li>
          Every arrow is a step. Its card comes from the <Mono>%% @step</Mono> comment above it, with the
          request&apos;s method and path, the reply&apos;s status code and message, and the payload parts (
          <Mono>@payload.headers</Mono>, <Mono>.body</Mono>, <Mono>.sql</Mono>…).
        </li>
        <li>
          A request card lists its replies with their status codes; a reply card links back to its request. Hover
          a status code for its general meaning.
        </li>
        <li>
          Chapters (<Mono>@section</Mono>) get their own colour: a light band behind the chapter&apos;s arrows with
          start and end markers, the progress bar and the code gutter. <Kbd>K</Kbd> keeps the arrow keys inside a
          chapter.
        </li>
        <li>
          <b>Path</b> in the step bar shows the happy path only, the errors only, or one <Mono>alt</Mono> branch.{' '}
          <b>Behind</b> lists the hooks, crons, utilities and config (<Mono>@uses</Mono>) and side effects (
          <Mono>@effect</Mono>) that take part without being a layer.
        </li>
        <li>
          <Kbd>I</Kbd> opens the Insight panel: layers, every endpoint with its replies, the error catalog, side
          parts, the glossary (<Mono>@term</Mono>) and the tables touched.
        </li>
        <li>
          <Kbd>A</Kbd> asks an AI about the current step or any word, in under 60 words. You choose a free provider
          and the answer is saved to the step&apos;s note. Underlined words open their definition.
        </li>
        <li>
          Walk with <Kbd>←</Kbd> <Kbd>→</Kbd>, jump chapters with <Kbd>[</Kbd> <Kbd>]</Kbd>, double-click a word to
          follow a value, <Kbd>N</Kbd> adds a note, <Kbd>P</Kbd> is presenter mode.
        </li>
        <li>
          Arrows without an explanation are listed in the code panel. <b>Copy fix-prompt</b> hands them to Claude.
        </li>
        <li>
          Export PDF, PNG, SVG or a step table. <b>Copy viewer link</b> shares this diagram with the code inside the
          link; <b>Copy link to this step</b> opens on the current step.
        </li>
        <li>
          Nothing is uploaded by the viewer itself. Diagrams, notes, bookmarks, saved terms and AI keys stay in this
          browser; an AI question goes only to the provider you picked.
        </li>
      </ul>
      <h3 className={styles.h3}>Set up the Claude skill (once)</h3>
      <ul className={styles.points}>
        <li>
          <b>Download the skill</b> below: the skill, a setup guide and install scripts in one zip.
        </li>
        <li>
          <b>Claude Code:</b> run <Mono>install-claude-code.ps1</Mono> (Windows) or <Mono>install-claude-code.sh</Mono>{' '}
          (macOS, Linux), then start a new session.
        </li>
        <li>
          <b>Claude app:</b> Settings → Capabilities → turn on code execution, then Customize → Skills → + → Upload a
          skill → <Mono>sequence-walkthrough.zip</Mono>.
        </li>
        <li>
          <b>Agent SDK or API:</b> follow <Mono>SKILL-SETUP-GUIDE.md</Mono> in the zip.
        </li>
      </ul>
      <h3 className={styles.h3}>Use the skill</h3>
      <ul className={styles.points}>
        <li>
          Ask Claude: &ldquo;Make a walkthrough diagram of the login flow in ./src&rdquo;. Say &ldquo;in easy
          language&rdquo; for beginner wording with the same layers and steps, &ldquo;only the part after the service
          layer&rdquo; for a scoped cut, or &ldquo;how would I add X, give me the flow&rdquo; for a proposed design. In
          Claude Code you can also type <Mono>/sequence-walkthrough</Mono>.
        </li>
        <li>
          Claude replies with the code only, no file. Every call shows its method and path, every reply its status
          code and message, with payload parts, side parts, a glossary and code links. Paste it here and step through
          it.
        </li>
        <li>
          Warnings in the code panel? Copy fix-prompt, paste it to Claude, paste the answer back. Notes stay on steps
          that didn&apos;t change.
        </li>
      </ul>
    </Dialog>
  );
}
