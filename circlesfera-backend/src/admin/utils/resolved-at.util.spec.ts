import { describe, expect, it } from 'vitest';
import { resolvedAtOnStatusChange } from './resolved-at.util.js';

describe('resolvedAtOnStatusChange', () => {
  it('sets resolvedAt on first terminal transition', () => {
    const before = new Date('2026-08-01T10:00:00Z');
    const result = resolvedAtOnStatusChange(
      'RESOLVED',
      null,
      ['RESOLVED', 'CLOSED'],
      'OPEN',
    );
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('preserves existing resolvedAt on repeat terminal update', () => {
    const existing = new Date('2026-08-01T12:00:00Z');
    expect(
      resolvedAtOnStatusChange('APPROVED', existing, ['APPROVED'], 'PENDING'),
    ).toBe(existing);
  });

  it('clears resolvedAt when reopening', () => {
    expect(
      resolvedAtOnStatusChange('OPEN', new Date(), ['RESOLVED'], 'OPEN'),
    ).toBeNull();
  });

  it('returns undefined for non-terminal non-reopen status', () => {
    expect(
      resolvedAtOnStatusChange('REVIEWING', null, ['RESOLVED'], 'OPEN'),
    ).toBeUndefined();
  });
});
