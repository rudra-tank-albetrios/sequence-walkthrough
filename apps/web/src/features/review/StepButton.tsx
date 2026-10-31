import { useFlowStore } from '../../shared/state/flowStore.ts';
import styles from './review.module.css';

/** "step N": closes the review and shows that step. */
export function StepButton({ index }: { index: number }) {
  const n = useFlowStore((s) => s.flow?.steps[index]?.n) ?? index + 1;
  const go = useFlowStore((s) => s.go);
  const setUi = useFlowStore((s) => s.setUi);
  return (
    <button
      type="button"
      className={styles.stepLink}
      aria-label={`Close the review and go to step ${n}`}
      onClick={() => {
        setUi({ reviewOpen: false, threatsOpen: false });
        go(index);
      }}
    >
      step {n}
    </button>
  );
}
