import styles from './Toast.module.css';
import { useToastStore } from './toast.ts';

export function ToastHost() {
  const message = useToastStore((s) => s.message);
  return (
    <div className={styles.host} role="status" aria-live="polite" aria-atomic="true">
      {message ? <div className={styles.toast}>{message}</div> : null}
    </div>
  );
}
