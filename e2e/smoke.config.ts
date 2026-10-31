import { defineConfig, devices } from '@playwright/test';

import { returningVisitor } from './visitors.ts';

// Smoke test against the live site (plan section 1, rule 8): `npm run smoke`.
// Point it elsewhere with SMOKE_URL=https://... npm run smoke
export const LIVE_URL = 'https://rudra-tank-albetrios.github.io/sequence-walkthrough/';
const baseURL = process.env.SMOKE_URL ?? LIVE_URL;

export default defineConfig({
  testDir: './smoke',
  reporter: [['list']],
  retries: 1,
  timeout: 90_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    storageState: returningVisitor(baseURL),
    trace: 'retain-on-failure',
  },
});
