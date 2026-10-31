import { SPEC_VERSION } from '@swv/core';

import { MERMAID_VERSION } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { Kbd } from '../../shared/ui/Kbd.tsx';
import styles from './guide.module.css';

interface Row {
  /** Each key or gesture is drawn as a key cap; `join` sits between them. */
  keys: string[];
  join?: string;
  does: string;
}

interface Group {
  title: string;
  rows: Row[];
}

/** The 29 rows of version 2's shortcuts table (docs/v2-internals.md section 3), in groups. */
const GROUPS: Group[] = [
  {
    title: 'Steps and chapters',
    rows: [
      { keys: ['←', '→'], does: 'Previous / next step (skips steps hidden by the path filter)' },
      { keys: ['Home', 'End'], join: '/', does: 'First / last step' },
      { keys: ['[', ']'], does: 'Previous / next chapter' },
      { keys: ['K'], does: 'Lock the arrow keys inside the current chapter' },
      { keys: ['Space'], does: 'Play / pause' },
    ],
  },
  {
    title: 'Diagram',
    rows: [
      { keys: ['↑', '↓'], does: 'Scroll' },
      { keys: ['+', '−'], does: 'Zoom in / out' },
      { keys: ['0'], does: 'Fit width' },
      { keys: ['F'], does: 'Fit all' },
      { keys: ['Ctrl', 'wheel'], join: '+', does: 'Zoom at the pointer (or pinch)' },
      { keys: ['Drag'], does: 'Move the diagram' },
      { keys: ['Hover an arrow'], does: 'Its summary: explanation, status, payload, side parts, code' },
      { keys: ['Click an arrow'], does: 'Jump to that step' },
      { keys: ['Click a name'], does: "Show only that participant's arrows" },
    ],
  },
  {
    title: 'Panels and modes',
    rows: [
      { keys: ['T'], does: 'Diagram ↔ Table' },
      { keys: ['I'], does: 'Analyze tools: layers, endpoints, errors, data, side parts' },
      { keys: ['A'], does: 'Ask AI about the current step' },
      { keys: ['H'], does: 'Hide controls' },
      { keys: ['P'], does: 'Presenter mode: one big card, controls hidden' },
      { keys: ['C'], does: 'Open / close the code panel' },
      { keys: ['B', 'N'], join: '/', does: 'Bookmark / note on the current step' },
    ],
  },
  {
    title: 'Find and help',
    rows: [
      { keys: ['/'], does: 'Find' },
      { keys: ['?'], does: 'This help' },
      {
        keys: ['Esc'],
        does: 'Close menu → find → Ask → note → Follow → spotlight → path filter → hide mode → Insight → code panel → overview',
      },
    ],
  },
  {
    title: 'Step bar and edges',
    rows: [
      { keys: ['Wheel over the step bar'], does: 'Previous / next step (a long card scrolls first)' },
      { keys: ["Drag the step bar's top edge"], does: 'Change its height; double-click the edge to reset' },
      {
        keys: ['Edge tabs'],
        does: "Fold the header (top) or the step bar (bottom) away; the tab stays on the edge to bring it back. The tab on the code panel's edge closes it",
      },
    ],
  },
  {
    title: 'Words',
    rows: [
      { keys: ['Double-click a word'], does: 'Follow that value through the flow' },
      { keys: ['Click an underlined word'], does: 'Its definition from the glossary' },
    ],
  },
];

const TAGS = [
  '%% @title',
  '@layer',
  '@trigger',
  '@term',
  '@section',
  '@summary',
  '@step',
  '@payload.body',
  '@ref',
  '@uses',
  '@effect',
  '@field',
  '@schema',
  '@state',
  '@unconfirmed',
];

function Keys({ row }: { row: Row }) {
  return (
    <span className={styles.keys}>
      {row.keys.map((k, i) => (
        <span key={k} className={styles.keys}>
          {i > 0 && row.join ? <span aria-hidden="true">{row.join}</span> : null}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </span>
  );
}

/** Every key and pointer gesture of the page (`?`). */
export function ShortcutsDialog() {
  const open = useFlowStore((s) => s.ui.shortcutsOpen);
  const setUi = useFlowStore((s) => s.setUi);
  const close = () => setUi({ shortcutsOpen: false });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Shortcuts"
      description="Keys and pointer gestures of the viewer, in groups."
      actions={
        <Button variant="primary" onClick={close}>
          Close
        </Button>
      }
    >
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className={styles.h3}>{group.title}</h3>
          <table className={styles.table}>
            <thead className="sr-only">
              <tr>
                <th scope="col">Key</th>
                <th scope="col">What it does</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.does}>
                  <td>
                    <Keys row={row} />
                  </td>
                  <td>{row.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className={styles.muted}>
        Annotations are Mermaid comments (spec {SPEC_VERSION}):{' '}
        {TAGS.map((tag, i) => (
          <span key={tag}>
            {i > 0 ? ', ' : ''}
            <code className="mono">{tag}</code>
          </span>
        ))}{' '}
        and the chips <code className="mono">@async @retry @timeout @idempotent</code>. Notes, bookmarks, saved terms
        and AI keys stay in this browser.
      </p>
      <p className={styles.muted}>Mermaid {MERMAID_VERSION}. mermaid.live may run a different version.</p>
    </Dialog>
  );
}
