import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber, formatTime } from './format';

const at = '2026-03-05T14:30:00.000Z';

describe('format', () => {
  it('writes dates in the given language, not the browser one', () => {
    expect(formatDate(at, 'en', { dateStyle: 'long' })).toBe('March 5, 2026');
    expect(formatDate(at, 'es', { dateStyle: 'long' })).toBe(
      '5 de marzo de 2026',
    );
    expect(formatDateTime(at, 'es')).toMatch(/^5 mar 2026/);
    expect(formatTime(at, 'en')).toMatch(/\d{1,2}:30\s?(AM|PM)/);
  });

  it('groups numbers in the given language and keeps missing values missing', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
    expect(formatNumber(1234567, 'es')).toBe('1.234.567');
    expect(formatNumber(undefined, 'es')).toBeUndefined();
    expect(formatNumber(null, 'es') || '0').toBe('0');
  });
});
