import { describe, expect, it } from 'vitest';
import {
  assertNotLeakedPassword,
  isLeakedPassword,
  parseLeakedPasswords,
} from './leaked-password.js';

// A checkout on Windows can turn the list's line endings into CRLF.
describe('the list of leaked passwords, read from its file', () => {
  it.each([
    ['LF', 'password\nqwerty\n'],
    ['CRLF', 'password\r\nqwerty\r\n'],
  ])('reads each password whole with %s line endings', (_ending, text) => {
    expect([...parseLeakedPasswords(text)]).toEqual(['password', 'qwerty']);
  });
});

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
