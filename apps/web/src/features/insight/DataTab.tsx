import type { DataTouched, Flow, Step } from '@swv/core';

import { Chip } from '../../shared/ui/Chip.tsx';
import { filesByPath } from './derive.ts';
import styles from './insight.module.css';
import { StepLink } from './StepLink.tsx';

/** The tables the SQL in payloads and labels touches, and the code files the `@ref` lines name. */
export function DataTab({ flow, steps }: { flow: Flow; steps: Step[] }) {
  const visible = new Set(steps.map((s) => s.idx));
  const tables = flow.data
    .map((d): DataTouched => ({ ...d, steps: d.steps.filter((i) => visible.has(i)) }))
    .filter((d) => d.steps.length > 0);
  const files = filesByPath(steps);
  return (
    <>
      <h3>Tables touched</h3>
      {tables.length > 0 ? (
        <table className={styles.it}>
          <thead>
            <tr>
              <th scope="col">Table</th>
              <th scope="col">Operations</th>
              <th scope="col">Steps</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((d) => (
              <tr key={d.table}>
                <td className="mono">{d.table}</td>
                <td>
                  <div className={styles.ilMeta}>
                    {d.ops.map((op) => (
                      <Chip key={op}>{op}</Chip>
                    ))}
                  </div>
                </td>
                <td>
                  <div className={styles.ilMeta}>
                    {d.steps.map((i) => (
                      <StepLink key={i} index={i} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.empty}>
          No SQL found in payloads or labels. Write queries as{' '}
          <span className="mono">@payload.sql …</span> to list the tables here.
        </p>
      )}
      <h3>Files in this flow</h3>
      {files.length > 0 ? (
        <ul className={styles.il}>
          {files.map(([path, indexes]) => (
            <li key={path}>
              <span className={styles.ref}>{path}</span>{' '}
              <span className={styles.ilMeta}>
                {indexes.map((i) => (
                  <StepLink key={i} index={i} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No @ref lines yet.</p>
      )}
    </>
  );
}
