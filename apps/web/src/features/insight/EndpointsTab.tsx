import type { Flow, Step } from '@swv/core';

import { cx } from '../../shared/lib/util.ts';
import { endpointList } from './derive.ts';
import styles from './insight.module.css';
import { StatusChip, StepLink } from './StepLink.tsx';

/** Every request whose label starts with an HTTP method and a path, with its replies. */
export function EndpointsTab({ flow, steps }: { flow: Flow; steps: Step[] }) {
  const list = endpointList(steps);
  if (list.length === 0) {
    return <p className={styles.empty}>No arrow label starts with an HTTP method and a path yet.</p>;
  }
  return (
    <table className={styles.it}>
      <thead>
        <tr>
          <th scope="col">Call</th>
          <th scope="col">From → To</th>
          <th scope="col">Replies</th>
        </tr>
      </thead>
      <tbody>
        {list.map((endpoint) => {
          const first = endpoint.steps[0] === undefined ? undefined : flow.steps[endpoint.steps[0]];
          return (
            <tr key={endpoint.key}>
              <td>
                <span className={cx(styles.method, styles[`m-${endpoint.method.toLowerCase()}`])}>
                  {endpoint.method}
                </span>{' '}
                <span className="mono">{endpoint.path}</span>
                <div className={styles.ilMeta}>
                  {endpoint.steps.map((i) => (
                    <StepLink key={i} index={i} />
                  ))}
                </div>
              </td>
              <td>{first ? `${first.fromName} → ${first.toName}` : ''}</td>
              <td>
                {endpoint.replies.length > 0 ? (
                  <div className={styles.ilMeta}>
                    {endpoint.replies.map((i) => (
                      <StatusChip key={i} index={i} />
                    ))}
                  </div>
                ) : (
                  <span className={styles.muted}>no reply arrow</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
