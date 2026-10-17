import { readFileSync } from 'node:fs';
import { ErrorCode } from '@circlesfera/shared';
import { AppException } from '../../common/errors/app.exception.js';

// Known leaked passwords, kept on the server: no outside service is called.
// Lowercased, so a change of case does not get one through. Source and
// licence in NOTICE.
let leaked: Set<string> | undefined;

function leakedPasswords(): Set<string> {
  if (!leaked) {
    const text = readFileSync(
      new URL('./leaked-passwords.txt', import.meta.url),
      'utf8',
    );
    leaked = new Set(text.split('\n').filter(Boolean));
  }
  return leaked;
}

export function isLeakedPassword(password: string): boolean {
  return leakedPasswords().has(password.toLowerCase());
}

/** Refuses a new password that is in the list of known leaked passwords. */
export function assertNotLeakedPassword(password: string): void {
  if (isLeakedPassword(password)) {
    throw AppException.BadRequest(
      ErrorCode.PASSWORD_LEAKED,
      'This password is in a list of leaked passwords. Choose another one.',
    );
  }
}
