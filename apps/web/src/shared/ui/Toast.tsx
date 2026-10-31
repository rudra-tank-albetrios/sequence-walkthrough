import styles from './Toast.module.css';
import { dismissToast, useToastStore } from './toast.ts';

export function ToastHost() {
  const message = useToastStore((s) => s.message);
  const action = useToastStore((s) => s.action);
  return (
    <div className={styles.host} role="status" aria-live="polite" aria-atomic="true" data-testid="toast">
      {message ? (
        <div className={styles.toast}>
          <span>{message}</span>
          {action ? (
            <button
              type="button"
              onClick={() => {
                dismissToast();
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
