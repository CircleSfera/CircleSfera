import { describe, expect, it } from 'vitest';
import {
  assertNotLeakedPassword,
  isLeakedPassword,
} from './leaked-password.js';

describe('leaked passwords', () => {
  it.each(['password', 'PassWord123', 'qwertyuiop', '12345678'])(
    'knows %s, whatever its case',
    (password) => {
      expect(isLeakedPassword(password)).toBe(true);
    },
  );

  it('lets through a password that is not on the list', () => {
    expect(isLeakedPassword('violet-harbour-lantern-42')).toBe(false);
    expect(() =>
      assertNotLeakedPassword('violet-harbour-lantern-42'),
    ).not.toThrow();
  });

  it('refuses a leaked one with its own error code', () => {
    expect(() => assertNotLeakedPassword('password1')).toThrow(
      expect.objectContaining({ errorCode: 'PASSWORD_LEAKED' }),
    );
  });
});
