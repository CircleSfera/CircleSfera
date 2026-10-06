import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import { createTestI18n } from '../test/test-utils';
import {
  apiErrorCode,
  apiErrorDetails,
  apiErrorMessage,
} from './apiErrorMessage';

// The error the API client rejects with (see handleApiError).
const clientError = (
  status: number | undefined,
  data?: object,
  extra: object = {},
) =>
  Object.assign(new Error('server text, never shown'), {
    status,
    data,
    ...extra,
  });

describe('apiErrorMessage', () => {
  const i18n = createTestI18n('es');
  const t = i18n.t.bind(i18n);

  it('shows the error code text in the reader language', () => {
    const error = clientError(400, { errorCode: 'CANNOT_TIP_SELF' });
    expect(apiErrorMessage(error, t, 'feedPrefs.error')).toBe(
      'No puedes enviarte una propina a ti mismo.',
    );
  });

  it('reads the raw Axios shape too', () => {
    const error = {
      response: { status: 403, data: { errorCode: 'EMAIL_NOT_VERIFIED' } },
    };
    expect(apiErrorMessage(error, t)).toBe(es.errors.codes.EMAIL_NOT_VERIFIED);
  });

  it('falls back by kind of failure, then to the screen message', () => {
    expect(
      apiErrorMessage(
        clientError(undefined, undefined, { isNetworkError: true }),
        t,
      ),
    ).toBe(es.errors.generic.network);
    expect(apiErrorMessage(clientError(429, {}), t)).toBe(
      es.errors.generic.rate_limited,
    );
    expect(apiErrorMessage(clientError(401, {}), t)).toBe(
      es.errors.generic.session_expired,
    );
    expect(apiErrorMessage(clientError(503, {}), t)).toBe(
      es.errors.generic.server,
    );
    expect(
      apiErrorMessage(
        clientError(400, { errorCode: 'HTTP_EXCEPTION' }),
        t,
        'feedPrefs.error',
      ),
    ).toBe(t('feedPrefs.error'));
    expect(apiErrorMessage(clientError(400, {}), t)).toBe(
      es.errors.generic.unknown,
    );
  });

  it('on sign-in forms a 401 is wrong credentials, not an ended session', () => {
    expect(
      apiErrorMessage(clientError(401, {}), t, 'auth.login.default_error', {
        signIn: true,
      }),
    ).toBe(t('auth.login.default_error'));
  });

  it('on sign-in forms the generic UNAUTHORIZED code is also wrong credentials', () => {
    const refused = clientError(401, { errorCode: 'UNAUTHORIZED' });
    expect(
      apiErrorMessage(refused, t, 'auth.login.default_error', { signIn: true }),
    ).toBe(t('auth.login.default_error'));
    // Elsewhere the same code keeps its own text.
    expect(apiErrorMessage(refused, t, 'feedPrefs.error')).toBe(
      t('errors.codes.UNAUTHORIZED'),
    );
  });

  it('never shows the server text', () => {
    const error = clientError(400, { message: 'Username is available' });
    expect(apiErrorMessage(error, t, 'feedPrefs.error')).not.toContain(
      'Username',
    );
  });

  it('reads the code and the details of either shape', () => {
    expect(
      apiErrorCode(clientError(403, { errorCode: 'ACCOUNT_BANNED' })),
    ).toBe('ACCOUNT_BANNED');
    expect(
      apiErrorDetails({
        response: { data: { details: { appealToken: 'x' } } },
      }),
    ).toEqual({ appealToken: 'x' });
    expect(apiErrorCode(null)).toBeUndefined();
  });

  it('both languages translate every error code and generic message', () => {
    expect(Object.keys(es.errors.codes).sort()).toEqual(
      Object.keys(en.errors.codes).sort(),
    );
    expect(Object.keys(es.errors.generic).sort()).toEqual(
      Object.keys(en.errors.generic).sort(),
    );
  });
});
