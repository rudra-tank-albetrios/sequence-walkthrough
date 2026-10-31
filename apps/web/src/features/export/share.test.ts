// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseHash, readLiveState } from '../../shared/lib/codec.ts';
import { liveLinkText, viewerLink } from './share.ts';

const CODE = 'sequenceDiagram\n  A->>B: hi';
const PAGE = 'https://example.test/viewer/#z.old&step=9';

describe('share links', () => {
  it('builds a viewer link on the page address with the code inside', async () => {
    const share = await viewerLink(CODE, null, PAGE, false);
    expect(share.text.startsWith('https://example.test/viewer/#z.')).toBe(true);
    expect(share.text).not.toContain('step=');
    expect(share.message).toBe('Copied a viewer link with the code inside');
    const parsed = await parseHash(share.text.slice(share.text.indexOf('#')));
    expect(parsed).toEqual({ code: CODE, step: null, failed: false });
  });

  it('adds the step and says so', async () => {
    const share = await viewerLink(CODE, 2, PAGE, false);
    expect(share.text.endsWith('&step=3')).toBe(true);
    expect(share.message).toBe('Copied a viewer link that opens on step 3');
  });

  it('copies only the fragment inside a Claude artifact', async () => {
    const share = await viewerLink(CODE, 0, PAGE, true);
    expect(share.text.startsWith('#z.')).toBe(true);
    expect(share.message).toBe(
      "Copied the code fragment for a viewer link that opens on step 1. Add it to the end of this page's link.",
    );
  });

  it('builds the mermaid.live link with the theme and grid', async () => {
    const share = await liveLinkText(CODE, 'dark', false);
    expect(share.message).toBe('Copied the mermaid.live link');
    const match = /#pako:(.+)$/.exec(share.text);
    expect(share.text.startsWith('https://mermaid.live/edit#pako:')).toBe(true);
    const state = await readLiveState('pako', match?.[1] ?? '');
    expect(state).toEqual({ code: CODE, theme: 'dark' });
  });
});
