import { beforeEach, describe, expect, it } from 'vitest';

import { formatBytes, storedEntries } from './storedData.ts';
import { Store } from './store.ts';

describe('the stored data list', () => {
  beforeEach(() => {
    for (const key of Store.keys('swv:')) Store.del(key);
  });

  it('names what is stored and never carries a value', () => {
    Store.set('swv:ai', { provider: 'x', keys: { x: 'do-not-show-this' } });
    Store.set('swv:notes:t:Checkout', { a: { star: true, note: 'private' } });
    Store.set('swv:notes:p:abc', {});
    Store.set('swv:quiz:stats', [1, 2, 3]);
    const entries = storedEntries();
    expect(JSON.stringify(entries)).not.toContain('do-not-show-this');
    expect(JSON.stringify(entries)).not.toContain('private');
    expect(entries.find((e) => e.key === 'swv:ai')?.items).toBeNull();
    expect(entries.find((e) => e.key === 'swv:notes:t:Checkout')).toMatchObject({ label: 'Checkout', group: 'Notes and bookmarks', items: 1 });
    expect(entries.find((e) => e.key === 'swv:notes:p:abc')?.label).toBe('A flow without a title');
    expect(entries.find((e) => e.key === 'swv:quiz:stats')).toMatchObject({ group: 'Other', label: 'quiz:stats', items: 3 });
  });

  it('writes sizes the way people read them', () => {
    expect(formatBytes(12)).toBe('12 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
