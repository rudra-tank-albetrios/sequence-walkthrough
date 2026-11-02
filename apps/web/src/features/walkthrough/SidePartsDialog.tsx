import type { Flow } from '@swv/core';

import { useFlowStore } from '../../shared/state/flowStore.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { Chip } from '../../shared/ui/Chip.tsx';
import { Dialog } from '../../shared/ui/Dialog.tsx';
import { TermText } from '../../shared/ui/TermText.tsx';
import { RefChip } from './StepFacts.tsx';
import styles from './walkbar.module.css';

/** The container a side part opens into: what each part does at this step, where it lives, who else uses it. */
export function SidePartsDialog({ flow }: { flow: Flow }) {
  const index = useFlowStore((s) => s.ui.sidePartsStep);
  const cur = useFlowStore((s) => s.cur);
  const go = useFlowStore((s) => s.go);
  const setUi = useFlowStore((s) => s.setUi);
  const step = index === null ? undefined : flow.steps[index];
  const close = () => {
    setUi({ sidePartsStep: null });
  };
  if (!step) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={`Side parts of step ${String(step.n)}`}
      description={step.explain || step.label.join(' ')}
      showDescription
      actions={
        <Button
          onClick={() => {
            setUi({ sidePartsStep: null, overlayTool: 'side-parts' });
          }}
        >
          See all side parts
        </Button>
      }
    >
      <ul className={styles.parts} data-testid="side-parts-dialog">
        {step.uses.map((part) => {
          const used = flow.uses.find((u) => u.kind === part.kind && u.name === part.name)?.steps ?? [step.idx];
          return (
            <li key={`${part.kind}:${part.name}`} className={styles.part}>
              <div className={styles.partHead}>
                <Chip tone="follow">{part.kind}</Chip>
                <b>{part.name}</b>
              </div>
              <dl className={styles.partFacts}>
                <dt>What it does</dt>
                <dd>{part.text ? <TermText text={part.text} /> : 'The flow does not say.'}</dd>
                {part.ref ? (
                  <>
                    <dt>Where it is</dt>
                    <dd>
                      <RefChip value={part.ref} />
                    </dd>
                  </>
                ) : null}
                <dt>Used on</dt>
                <dd className={styles.partSteps}>
                  {used.map((i) => (
                    <Chip
                      key={i}
                      tone={i === cur ? 'marker' : 'neutral'}
                      title={`Go to step ${String(i + 1)}`}
                      onClick={() => {
                        go(i);
                        setUi({ sidePartsStep: i });
                      }}
                    >
                      {i + 1}
                    </Chip>
                  ))}
                </dd>
              </dl>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
