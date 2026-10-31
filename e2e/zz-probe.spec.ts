import { expect, test } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { dispatchDrop, openSafeFlow } from './support/armed.ts';

const lines = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('\n');
const nest = (d: number, arrows: number) =>
  `sequenceDiagram\n${lines(d, () => 'alt x')}\n${lines(arrows, (i) => `A->>B: y${i}`)}\n${lines(d, () => 'end')}`;
const annotated = (n: number) =>
  `sequenceDiagram\n  %% @title Big\n${lines(n, (i) => `  %% @step This is a sentence that explains arrow number ${i} in plain words.\n  %% @payload.body {"id": ${i}, "name": "value"}\n  A->>B: POST /items/${i}\n  B-->>A: 200 ok`)}`;

const CASES: Record<string, string> = {
  'normal 45 KB': annotated(250),
  'normal 100 KB': annotated(560),
  'normal 200 KB': annotated(1120),
  'normal 500 KB': annotated(2800),
  'nest 50': nest(50, 50),
  'nest 200': nest(200, 200),
  'nest 1000': nest(1000, 1000),
  'nest 5000': nest(5000, 5000),
  'wide alt 5000 arrows nest 32': nest(32, 5000),
  'participants 2000': `sequenceDiagram\n${lines(2000, (i) => `participant P${i}`)}\nP0->>P1: x`,
  'one long label 400 KB': `sequenceDiagram\nA->>B: ${'x '.repeat(200000)}`,
  'long note 400 KB': `sequenceDiagram\nNote over A: ${'<b>'.repeat(130000)}`,
  'brs 400 KB': `sequenceDiagram\nA->>B: ${'<br/>'.repeat(80000)}`,
};

for (const [name, code] of Object.entries(CASES)) {
  test(name, async ({ page, baseURL }) => {
    test.setTimeout(100_000);
    await page.addInitScript('window.__maxText = 5000000');
    await openSafeFlow(page);
    const started = Date.now();
    await dispatchDrop(page, 'huge.mmd', code);
    let outcome = 'unknown';
    try {
      await expect
        .poll(
          async () =>
            page.evaluate<string>(`(() => {
              const h = document.querySelector('h1')?.textContent ?? '';
              const alert = document.querySelector('[data-testid="err-badge"]')?.textContent ?? '';
              const steps = document.querySelectorAll('.swv-hit').length;
              return h !== 'Safe' && (steps > 0 || alert) ? 'done steps=' + steps + ' alert=' + alert.slice(0, 60) : '';
            })()`),
          { timeout: 90_000, intervals: [100] },
        )
        .not.toBe('');
      outcome = await page.evaluate<string>(`document.querySelectorAll('.swv-hit').length + ' hits, alert: ' + (document.querySelector('[data-testid="err-badge"]')?.textContent ?? '').slice(0, 60)`);
    } catch (error) {
      outcome = `no result: ${String(error).slice(0, 100)}`;
    }
    appendFileSync('tmp/probe.log', `${name} | ${code.length} chars | ${Date.now() - started} ms | ${outcome}\n`);
    expect(baseURL).toBeTruthy();
  });
}
