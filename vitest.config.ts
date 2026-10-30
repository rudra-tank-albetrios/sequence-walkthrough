import { defineConfig } from 'vitest/config';

// Every workspace folder is a Vitest project. A folder without tests passes.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'examples/*', 'tools/*'],
    passWithNoTests: true,
    reporters: process.env.CI ? ['dot', 'github-actions'] : ['dot'],
  },
});
