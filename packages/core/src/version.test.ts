import { describe, expect, it } from 'vitest';

import { APP_VERSION, SPEC_VERSION } from './index.ts';

describe('version', () => {
  it('names the walkthrough/2 format', () => {
    expect(SPEC_VERSION).toBe('walkthrough/2');
  });

  it('is a 3.x version', () => {
    expect(APP_VERSION.startsWith('3.')).toBe(true);
  });
});
