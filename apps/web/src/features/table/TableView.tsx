import { STATUS_TEXT, type Flow, type Step } from '@swv/core';
import { Fragment, useEffect, useMemo, useRef, type CSSProperties } from 'react';

import { useIsNarrow } from '../../shared/hooks/useMediaQuery.ts';
import { copyTableMarkdown, saveTableCsv } from '../../shared/lib/tableActions.ts';
import { cx } from '../../shared/lib/util.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { useNotesStore } from '../../shared/state/notesStore.ts';
import { pathVisible } from '../../shared/state/path.ts';
import { findHits } from '../../shared/state/search.ts';
import { route, type NotesData } from '../../shared/storage/notes.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import styles from './table.module.css';

/** `src/a/b.ts:12` with a break opportunity after every slash, so long paths wrap in the cell. */
function Ref({ text }: { text: string }) {
  const parts = text.split('/');
  return (
    <span className={styles.ref}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <>
              /<wbr />
            </>
          ) : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

function Sends({ step }: { step: Step }) {
  return step.label.map((line, i) => {
    const status = i === 0 ? step.status : null;
    const family = status ? `s-${Math.floor(status.code / 100)}xx` : '';
    return (
      <Fragment key={i}>
        {i > 0 ? <br /> : null}
        {status ? (
          <>
            <span
              className={cx(styles.status, styles[family])}
              {...(STATUS_TEXT[status.code] ? { title: STATUS_TEXT[status.code] } : {})}
            >
              {status.code}
            </span>{' '}
            {line.replace(/^\d{3}\s*/, '')}
          </>
        ) : (
          line
        )}
      </Fragment>
    );
  });
}

interface RowProps {
  flow: Flow;
  step: Step;
  hasChapters: boolean;
  chapterStart: boolean;
  isCur: boolean;
  follow: boolean;
  hit: boolean;
  notes: NotesData;
}

function Row({ flow, step, hasChapters, chapterStart, isCur, follow, hit, notes }: RowProps) {
  const go = useFlowStore((s) => s.go);
  const setView = useFlowStore((s) => s.setView);
  const section = flow.sections[step.section];
  const entry = notes[step.key];
  const note = `${entry?.star ? '★ ' : ''}${entry?.note ?? ''}`;
  const behind = step.uses.length + step.effects.length + step.unconfirmed.length > 0;
  return (
    <tr
      data-step={step.idx}
      className={cx(
        isCur && styles.cur,
        follow && styles.follow,
        hit && styles.findhit,
        hasChapters && chapterStart && styles.chapStart,
      )}
      style={section ? ({ '--ch': section.hue } as CSSProperties) : undefined}
      {...(isCur ? { 'aria-current': 'step' as const } : {})}
      onClick={() => go(step.idx, { camera: false })}
      onDoubleClick={() => {
        setView('diagram');
        go(step.idx);
      }}
    >
      <td className={styles.n} data-l="Step">
        <button type="button" className={styles.nBtn} aria-label={`Go to step ${step.n}`}>
          {step.n}
        </button>
      </td>
      {hasChapters ? (
        <td className={styles.ch} data-l="Chapter">
          {chapterStart && section ? (
            <>
              <span className={styles.dot} aria-hidden="true" />
              {section.name}
            </>
          ) : null}
        </td>
      ) : null}
      <td className={styles.rt} data-l="From → To">
        {route(step)} <Chip className={styles[`k-${step.kind}`]}>{step.kind}</Chip>
      </td>
      <td className={cx(styles.sends, 'mono')} data-l="Sends">
        <Sends step={step} />
      </td>
      <td className={styles.does} data-l="Does">
        {step.explain || <span className={styles.none}>No explanation</span>}
      </td>
      <td data-l="Branch">
        {step.branch.map((b) => (
          <Chip key={`${b.id}-${b.kind}`} className={styles.br}>
            <b>{b.kind}</b> {b.label}
          </Chip>
        ))}
      </td>
      <td data-l="Behind">
        {behind ? (
          <>
            {step.uses.map((u, i) => (
              <Chip key={`u${i}`} tone="follow" title={u.text}>
                {u.kind} {u.name}
              </Chip>
            ))}
            {step.effects.map((t, i) => (
              <Chip key={`e${i}`} tone="ok">
                {t}
              </Chip>
            ))}
            {step.unconfirmed.map((t, i) => (
              <Chip key={`c${i}`} tone="unconfirmed" title={t}>
                unconfirmed
              </Chip>
            ))}
          </>
        ) : null}
      </td>
      <td data-l="Ref">
        {step.refs.map((r, i) => (
          <Fragment key={i}>
            {i > 0 ? ' ' : null}
            <Ref text={r} />
          </Fragment>
        ))}
      </td>
      <td data-l="Note">{note || null}</td>
    </tr>
  );
}

/** Every step as a row: the same facts as the cards, scannable and exportable. */
export function TableView() {
  const view = useFlowStore((s) => s.view);
  const flow = useFlowStore((s) => s.flow);
  const cur = useFlowStore((s) => s.cur);
  const path = useFlowStore((s) => s.path);
  const spot = useFlowStore((s) => s.spot);
  const follow = useFlowStore((s) => s.follow);
  const findQuery = useFlowStore((s) => s.findQuery);
  const setView = useFlowStore((s) => s.setView);
  const notes = useNotesStore((s) => s.data);
  const narrow = useIsNarrow();
  const includeNotes = useFlowStore((s) => s.ui.tableNotes);
  const setUi = useFlowStore((s) => s.setUi);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const open = view === 'table';

  const hits = useMemo(() => new Set(findHits(flow, findQuery)), [flow, findQuery]);
  const followSet = useMemo(() => new Set(follow?.hits ?? []), [follow]);
  const rows = useMemo(
    () =>
      flow?.isSequence
        ? flow.steps.filter(
            (s) => pathVisible(s, path) && (spot === null || s.from === spot || s.to === spot),
          )
        : [],
    [flow, path, spot],
  );

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.querySelector('tr[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
  }, [cur, open, rows]);

  const hasChapters = (flow?.sections.length ?? 0) > 0;
  const columns = hasChapters ? 9 : 8;

  return (
    <section id="tableView" aria-label="Step table" hidden={!open} className={styles.view}>
      {open ? (
        <>
          <div ref={scrollRef} className={styles.scroll} data-table-scroll tabIndex={0}>
            <table className={styles.tv}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  {hasChapters ? <th scope="col">Chapter</th> : null}
                  <th scope="col">From → To</th>
                  <th scope="col">Sends</th>
                  <th scope="col">Does</th>
                  <th scope="col">Branch</th>
                  <th scope="col">Behind</th>
                  <th scope="col">Ref</th>
                  <th scope="col">★ Note</th>
                </tr>
              </thead>
              <tbody>
                {flow?.isSequence ? (
                  rows.map((step, i) => (
                    <Row
                      key={step.idx}
                      flow={flow}
                      step={step}
                      hasChapters={hasChapters}
                      chapterStart={i === 0 || rows[i - 1]?.section !== step.section}
                      isCur={step.idx === cur}
                      follow={followSet.has(step.idx)}
                      hit={hits.has(step.idx)}
                      notes={notes}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns} className={styles.none}>
                      The table works with sequence diagrams.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className={styles.foot}>
            <label>
              <input
                type="checkbox"
                id="tvNotes"
                checked={includeNotes}
                onChange={(e) => {
                  setUi({ tableNotes: e.target.checked });
                }}
              />
              Include my notes
            </label>
            {narrow ? <Button onClick={() => setView('diagram')}>Back to diagram</Button> : null}
            <Button onClick={() => void copyTableMarkdown()} disabled={!flow?.isSequence}>
              Copy as Markdown
            </Button>
            <Button onClick={() => void saveTableCsv()} disabled={!flow?.isSequence}>
              Download CSV
            </Button>
          </footer>
        </>
      ) : null}
    </section>
  );
}
