import { describe, expect, it } from 'vitest';

import { base64url, deflate, fromBase64url, inflate, liveLink, parseHash, shareFragment } from './codec.ts';

const CODE = 'sequenceDiagram\n  %% @title Round trip\n  A->>B: hi ₹';

describe('codec', () => {
  it('round-trips code through deflate and base64url', async () => {
    const bytes = await deflate(CODE);
    expect(await inflate(fromBase64url(base64url(bytes)))).toBe(CODE);
  });

  it('writes and reads the viewer fragment with a step', async () => {
    const fragment = await shareFragment(CODE, 4);
    expect(fragment.startsWith('#z.')).toBe(true);
    expect(fragment.endsWith('&step=5')).toBe(true);
    const parsed = await parseHash(fragment);
    expect(parsed).toEqual({ code: CODE, step: 4, failed: false });
  });

  it('accepts a mermaid.live pako state and the step-N form', async () => {
    const link = await liveLink(CODE, 'forest', true);
    const hash = link.slice(link.indexOf('#'));
    const parsed = await parseHash(`${hash}&step-2`);
    expect(parsed.code).toBe(CODE);
    expect(parsed.step).toBe(1);
  });

  it('reports a fragment it cannot read without throwing', async () => {
    const parsed = await parseHash('#z.not-really-deflate');
    expect(parsed.failed).toBe(true);
    expect(parsed.code).toBeNull();
  });
});
