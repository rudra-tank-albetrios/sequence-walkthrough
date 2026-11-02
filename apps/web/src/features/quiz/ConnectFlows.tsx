import { plural } from '../../shared/lib/util.ts';
import type { KeptFlow } from '../../shared/storage/flowHistory.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { MAX_CONNECTED } from './connect.ts';
import styles from './quiz.module.css';

const dateOf = (time: number): string =>
  new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export interface ConnectFlowsProps {
  title: string;
  flows: readonly KeptFlow[];
  chosen: readonly string[];
  onChange: (chosen: string[]) => void;
  onForget: (id: string) => void;
}

/** Your other flows, to add to this quiz. Without a tick, the quiz covers the flow on screen only. */
export function ConnectFlows({ title, flows, chosen, onChange, onForget }: ConnectFlowsProps) {
  const full = chosen.length >= MAX_CONNECTED;
  return (
    <fieldset className={`${styles.group} ${styles.panel}`}>
      <legend className={styles.legend}>Connect other flows</legend>
      <p className={styles.hint}>
        This quiz covers only <strong>{title}</strong> unless you tick more. Questions are shared
        out between the flows, with up to {MAX_CONNECTED} more.
      </p>
      <ul className={styles.connectList}>
        {flows.map((flow) => {
          const checked = chosen.includes(flow.id);
          return (
            <li key={flow.id} className={styles.connectRow}>
              <label className={styles.connectLabel}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={full && !checked}
                  onChange={(ev) => {
                    onChange(
                      ev.target.checked
                        ? [...chosen, flow.id]
                        : chosen.filter((id) => id !== flow.id),
                    );
                  }}
                />
                <span className={styles.connectName}>{flow.title}</span>
                <span className={styles.connectMeta}>
                  {plural(flow.steps, 'step')}, last seen {dateOf(flow.savedAt)}
                </span>
              </label>
              <Button
                variant="ghost"
                aria-label={`Remove ${flow.title} from this list`}
                onClick={() => {
                  onForget(flow.id);
                }}
              >
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
