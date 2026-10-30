import { APP_VERSION, SPEC_VERSION } from '@swv/core';

import styles from './App.module.css';

export function App() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Sequence Walkthrough</h1>
      <p className={styles.lead}>
        Version {APP_VERSION} of the viewer is being built here. It reads the{' '}
        <code>{SPEC_VERSION}</code> format.
      </p>
    </main>
  );
}
