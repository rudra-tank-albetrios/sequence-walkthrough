import { defineConfig, devices } from '@playwright/test';

// Worktrees that run at the same time need their own port: an existing server is reused locally.
const PORT = Number(process.env.SWV_E2E_PORT ?? 4173);
const CI = Boolean(process.env.CI);
// SWV_E2E_URL=http://127.0.0.1:5173 runs the specs against a dev server that is already up
// (no build, no preview server). CI never sets it.
const externalUrl = CI ? undefined : process.env.SWV_E2E_URL;

// Every project runs in CI. Locally, SWV_E2E_PROJECTS=chromium,webkit,phone limits the run when a
// browser cannot start on the machine (docs/decisions.md). CI ignores the variable.
const projectFilter = CI
  ? null
  : process.env.SWV_E2E_PROJECTS?.split(',').map((name) => name.trim());
// The desktop specs drive controls that a phone keeps in the ⋯ menu; phone.spec.ts covers the phone.
const PHONE_SPECS = ['**/phone.spec.ts', '**/app.spec.ts'];
const NOT_ON_DESKTOP = ['**/smoke/**', '**/phone.spec.ts'];
const allProjects = [
  { name: 'chromium', testIgnore: NOT_ON_DESKTOP, use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', testIgnore: NOT_ON_DESKTOP, use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', testIgnore: NOT_ON_DESKTOP, use: { ...devices['Desktop Safari'] } },
  { name: 'phone', testMatch: PHONE_SPECS, use: { ...devices['Pixel 7'] } },
];

// Browser tests for the web app. `npm run build` must have run first: the built site is served
// with `vite preview`, which is also how the hosted site behaves.
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/smoke/**'],
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: externalUrl ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: projectFilter
    ? allProjects.filter((project) => projectFilter.includes(project.name))
    : allProjects,
  ...(externalUrl
    ? {}
    : {
        webServer: {
          command: `npm run -w @swv/web preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
          url: `http://127.0.0.1:${PORT}`,
          reuseExistingServer: !CI,
          timeout: 60_000,
        },
      }),
});
