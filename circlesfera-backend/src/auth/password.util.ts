import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

/**
 * Whether a password is the one behind a stored hash. Any format that is not
 * a known hash, and any hash that cannot be read, is a no: never a comparison
 * of plain text.
 */
export async function passwordMatches(
  storedHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!storedHash) return false;
  try {
    if (storedHash.startsWith('$argon2')) {
      return await argon2.verify(storedHash, password);
    }
    if (/^\$2[aby]\$/.test(storedHash)) {
      return await bcrypt.compare(password, storedHash);
    }
    return false;
  } catch {
    return false;
  }
}
