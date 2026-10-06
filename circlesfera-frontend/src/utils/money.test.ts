import { describe, expect, it } from 'vitest';
import { formatCents } from './money';

describe('formatCents', () => {
  it('formats cents in euros by default, in the app language', () => {
    expect(formatCents(123456, 'en')).toBe('€1,234.56');
    expect(formatCents(12345678, 'es')).toMatch(/^123\.456,78\s€$/);
  });

  it('uses the given currency whatever its case', () => {
    expect(formatCents(500, 'en', 'usd')).toBe('$5.00');
  });
});
