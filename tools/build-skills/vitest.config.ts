import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // These tests build the real skills, then run the scripts in a Node process of their own, which
    // says nothing about speed: on a busy machine one process can take seconds just to start.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
