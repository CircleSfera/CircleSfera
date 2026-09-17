import { type E2eAccount, uniqueAccount, uniqueSuffix } from './unique.js';

export interface E2eAccountOverrides {
  username?: string;
  email?: string;
  fullName?: string;
  password?: string;
  dateOfBirth?: string;
}

/**
 * Build a deterministic E2E account payload with optional overrides.
 */
export function buildE2eAccount(
  prefix = 'e2e',
  overrides: E2eAccountOverrides = {},
): E2eAccount {
  const base = uniqueAccount(prefix);
  return {
    ...base,
    ...overrides,
  };
}

/**
 * Build a deterministic Creator account payload.
 */
export function buildCreatorAccount(
  overrides: E2eAccountOverrides = {},
): E2eAccount {
  return buildE2eAccount('creator', {
    fullName: 'E2E Verified Creator',
    ...overrides,
  });
}

/**
 * Build a deterministic Post payload for UI composer or API tests.
 */
export function buildE2ePostData(
  overrides: { caption?: string; mode?: string } = {},
) {
  const suffix = uniqueSuffix();
  return {
    caption: overrides.caption ?? `E2E scenario post #${suffix}`,
    mode: overrides.mode ?? 'post',
  };
}
