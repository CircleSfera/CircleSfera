import { randomBytes } from 'node:crypto';

/**
 * Per-spec suffix for emails/usernames.
 * Same constraint as backend e2e: `Date.now()` collides across Playwright workers.
 * Username charset: [a-zA-Z0-9._]
 */
export function uniqueSuffix(): string {
  return `${process.pid.toString(36)}${randomBytes(5).toString('hex')}`;
}

export const E2E_PASSWORD = 'Password123!';

export function uniqueAccount(prefix = 'e2e'): {
  email: string;
  username: string;
  fullName: string;
  password: string;
  dateOfBirth: string;
} {
  const suffix = uniqueSuffix();
  const username = `${prefix}${suffix}`.slice(0, 24);
  return {
    email: `${username}@circlesfera.test`,
    username,
    fullName: 'E2E Tester',
    password: E2E_PASSWORD,
    dateOfBirth: '1995-06-15',
  };
}

export type E2eAccount = ReturnType<typeof uniqueAccount>;
