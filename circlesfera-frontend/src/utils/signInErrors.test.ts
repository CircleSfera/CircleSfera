import { describe, expect, it } from 'vitest';
import { signInError } from './signInErrors';

const t = ((key: string) => key) as never;
const refused = (errorCode?: string) => ({ status: 400, data: { errorCode } });

describe('signInError', () => {
  it.each([
    ['SIGN_IN_EMAIL_TAKEN', 'email'],
    ['SIGN_IN_PROOF_INVALID', 'currentPassword'],
    ['SIGN_IN_PROOF_REQUIRED', 'currentPassword'],
    ['SIGN_IN_ALREADY_OWN', 'form'],
    ['SIGN_IN_NOT_FOUND', 'form'],
    ['SIGN_IN_LIMIT_REACHED', 'form'],
  ])('puts %s next to the %s', (code, field) => {
    expect(signInError(refused(code), t)).toEqual({
      field,
      message: `settings.signIns.errors.${code}`,
    });
  });

  it.each([
    ['a code it does not know', refused('SOMETHING_ELSE')],
    ['no code', refused()],
    ['a network failure', new Error('Network Error')],
  ])(
    'says the change could not be saved for %s, never the server text',
    (_case, error) => {
      expect(signInError(error, t)).toEqual({
        field: 'form',
        message: 'settings.signIns.errors.generic',
      });
    },
  );
});
