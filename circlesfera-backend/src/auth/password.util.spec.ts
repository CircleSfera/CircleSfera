import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import { passwordMatches } from './password.util.js';

describe('passwordMatches', () => {
  it('accepts the password behind an argon2 hash and refuses another', async () => {
    const hash = await argon2.hash('Correct-Horse-1');
    await expect(passwordMatches(hash, 'Correct-Horse-1')).resolves.toBe(true);
    await expect(passwordMatches(hash, 'correct-horse-1')).resolves.toBe(false);
  });

  it('accepts the password behind an old bcrypt hash and refuses another', async () => {
    const hash = await bcrypt.hash('Correct-Horse-1', 4);
    await expect(passwordMatches(hash, 'Correct-Horse-1')).resolves.toBe(true);
    await expect(passwordMatches(hash, 'nope')).resolves.toBe(false);
  });

  it.each([
    ['plain text stored as the password', 'Correct-Horse-1'],
    ['a hash that cannot be read', '$argon2id$broken'],
    ['nothing stored', null],
    ['an empty string', ''],
  ])('refuses %s, never comparing plain text', async (_case, stored) => {
    await expect(passwordMatches(stored, 'Correct-Horse-1')).resolves.toBe(
      false,
    );
  });
});
