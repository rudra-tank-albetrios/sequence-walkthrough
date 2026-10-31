import { describe, expect, it } from 'vitest';

import { latinText } from './pdf.ts';

describe('the invisible copy of a PDF line', () => {
  it('leaves Latin text as it is', () => {
    expect(latinText('POST /api/orders (café) 100%')).toBe('POST /api/orders (café) 100%');
  });

  it('spells out the signs a PDF font does not have', () => {
    expect(latinText('API → DB – “done”… ₹500')).toBe('API -> DB - "done"... Rs 500');
  });

  it('puts a question mark for any other letter, which still shows on the page itself', () => {
    expect(latinText('नमस्ते')).toMatch(/^\?+$/);
  });
});
