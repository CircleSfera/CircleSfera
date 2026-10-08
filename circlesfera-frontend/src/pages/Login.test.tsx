import { startAuthentication } from '@simplewebauthn/browser';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, passkeyApi, profileApi } from '../services';
import { apiClient } from '../services/api';
import { renderWithProviders } from '../test/test-utils';
import Login from './Login';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../services', () => ({
  authApi: { login: vi.fn() },
  profileApi: { getMyProfile: vi.fn() },
  passkeyApi: {
    getLoginOptions: vi.fn(),
    verifyLogin: vi.fn(),
  },
}));

vi.mock('../services/socketStore', () => ({
  useSocketStore: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    socket: null,
  })),
}));

vi.mock('../utils/visitorId', () => ({
  getVisitorId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/api', () => ({
  apiClient: { post: vi.fn() },
}));

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Stands in for the security check: the button plays the solved challenge.
vi.mock('../components/auth/TurnstileWidget', () => ({
  default: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" onClick={() => onToken('captcha-token')}>
      solve security check
    </button>
  ),
}));

function fillAndSubmit(
  i18n: I18nInstance,
  identifier = 'user@example.com',
  password = 'password123',
) {
  fireEvent.change(
    screen.getByLabelText(i18n.t('auth.login.identifier_label')),
    {
      target: { value: identifier },
    },
  );
  fireEvent.change(screen.getByLabelText(i18n.t('auth.login.password_label')), {
    target: { value: password },
  });
  fireEvent.click(screen.getByTestId('login-submit-button'));
}

const BANNED_WITH_TOKEN = {
  response: {
    data: {
      message: 'ACCOUNT_BANNED',
      details: { appealToken: 'appeal-token-1' },
    },
  },
};

describe('Login Page Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    vi.mocked(authApi.login).mockResolvedValue({ data: {} } as never);
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: {
        id: 'profile-1',
        username: 'testuser',
        fullName: 'Test User',
      },
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders login form correctly', () => {
    const { i18n } = renderWithProviders(<Login />);

    expect(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
    ).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-button')).toBeInTheDocument();
    expect(
      screen.getByTitle(i18n!.t('auth.login.forgot_password')),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('handles successful login via authApi and loads profile', async () => {
    const { i18n } = renderWithProviders(<Login />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
      {
        target: { value: 'test@example.com' },
      },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
      {
        target: { value: 'password123' },
      },
    );
    fireEvent.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'test@example.com',
          password: 'password123',
        }),
      );
    });

    await waitFor(() => {
      expect(profileApi.getMyProfile).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('displays error on failed login', async () => {
    // The shape the API client rejects with (see handleApiError).
    vi.mocked(authApi.login).mockRejectedValueOnce(
      Object.assign(new Error('Invalid credentials'), {
        status: 401,
        data: { message: 'Invalid credentials', errorCode: 'HTTP_EXCEPTION' },
      }),
    );

    const { i18n } = renderWithProviders(<Login />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
      {
        target: { value: 'wrong@example.com' },
      },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
      {
        target: { value: 'wrongpass' },
      },
    );
    fireEvent.click(screen.getByTestId('login-submit-button'));

    // The reader's language, never the server's English text.
    await waitFor(() => {
      expect(
        screen.getByText(i18n!.t('auth.login.default_error')),
      ).toBeInTheDocument();
    });
  });

  it('shows 2FA chrome from the catalog when required', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: { data: { message: '2FA_REQUIRED' } },
    });

    const { i18n } = renderWithProviders(<Login />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
      { target: { value: 'user@example.com' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
      { target: { value: 'password123' } },
    );
    fireEvent.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(
        screen.getByLabelText(i18n!.t('auth.login.2fa_code')),
      ).toBeInTheDocument();
    });
    expect(i18n!.t('auth.login.2fa_code')).toBe('Authentication Code');
    expect(
      screen.getByText(i18n!.t('auth.login.2fa_hint')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Código de autenticación'),
    ).not.toBeInTheDocument();
  });

  it('asks for a password reset instead of the raw error code when one is required', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: { data: { message: 'PASSWORD_RESET_REQUIRED' } },
    });

    const { i18n } = renderWithProviders(<Login />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
      { target: { value: 'user@example.com' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
      { target: { value: 'password123' } },
    );
    fireEvent.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(
        screen.getByText(i18n!.t('auth.login.password_reset_required')),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('link', {
        name: i18n!.t('auth.login.password_reset_required_cta'),
      }),
    ).toHaveAttribute('href', '/forgot-password');
    expect(
      screen.queryByText('PASSWORD_RESET_REQUIRED'),
    ).not.toBeInTheDocument();
  });

  it('shows appeal chrome from the catalog when banned with token', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: {
        data: {
          message: 'ACCOUNT_BANNED',
          details: { appealToken: 'appeal-token-1' },
        },
      },
    });

    const { i18n } = renderWithProviders(<Login />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
      { target: { value: 'banned@example.com' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
      { target: { value: 'password123' } },
    );
    fireEvent.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(
        screen.getByText(i18n!.t('auth.login.banned_message')),
      ).toBeInTheDocument();
    });
    expect(i18n!.t('auth.login.submit_appeal')).toBe('Submit Appeal');
    expect(
      screen.getByLabelText(i18n!.t('auth.login.appeal_reason_label')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('auth.login.submit_appeal') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Motivo de la apelación'),
    ).not.toBeInTheDocument();
  });

  it('shows the appeal form for a banned profile with the real API client error', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce(
      Object.assign(new Error('ACCOUNT_BANNED'), {
        status: 403,
        data: {
          message: 'ACCOUNT_BANNED',
          errorCode: 'ACCOUNT_BANNED',
          details: { appealToken: 'appeal-token-real', reason: 'Spam' },
        },
      }),
    );

    const { i18n } = renderWithProviders(<Login />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
      { target: { value: 'banned@example.com' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
      { target: { value: 'password123' } },
    );
    fireEvent.click(screen.getByTestId('login-submit-button'));

    expect(
      await screen.findByLabelText(i18n!.t('auth.login.appeal_reason_label')),
    ).toBeInTheDocument();
  });

  it('shows ban reason when provided in error response', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: {
        data: {
          message: 'ACCOUNT_BANNED',
          details: {
            appealToken: 'appeal-token-2',
            reason: 'Severe spam violations',
          },
        },
      },
    });

    const { i18n } = renderWithProviders(<Login />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
      { target: { value: 'spammer@example.com' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
      { target: { value: 'password123' } },
    );
    fireEvent.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(screen.getByText(/Severe spam violations/)).toBeInTheDocument();
    });
  });

  it('shows suspension banner with date and reason when suspended', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: {
        data: {
          message: 'ACCOUNT_SUSPENDED',
          details: {
            suspendedUntil: '2026-10-15T00:00:00.000Z',
            reason: 'Temporary safety hold',
          },
        },
      },
    });

    const { i18n } = renderWithProviders(<Login />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
      { target: { value: 'suspended@example.com' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
      { target: { value: 'password123' } },
    );
    fireEvent.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(screen.getByText(/Temporary safety hold/)).toBeInTheDocument();
    });
  });

  it('lets a suspended Profile appeal without showing the ban message', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: {
        data: {
          message: 'ACCOUNT_SUSPENDED',
          details: {
            suspendedUntil: '2026-10-15T00:00:00.000Z',
            appealToken: 'appeal-token-3',
          },
        },
      },
    });

    const { i18n } = renderWithProviders(<Login />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
      { target: { value: 'suspended@example.com' } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.login.password_label')),
      { target: { value: 'password123' } },
    );
    fireEvent.click(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(
        screen.getByLabelText(i18n!.t('auth.login.appeal_reason_label')),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(i18n!.t('auth.login.banned_message')),
    ).not.toBeInTheDocument();
  });

  it('opens the home page even when the profile cannot be loaded', async () => {
    vi.mocked(profileApi.getMyProfile).mockRejectedValue(new Error('down'));
    const { i18n } = renderWithProviders(<Login />);

    fillAndSubmit(i18n!);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  describe('security check', () => {
    it('does not sign in until the security check is solved, then sends its token', async () => {
      vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
      const { i18n } = renderWithProviders(<Login />);

      fillAndSubmit(i18n!);

      expect(
        screen.getByText(i18n!.t('auth.captcha_required')),
      ).toBeInTheDocument();
      expect(authApi.login).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole('button', { name: 'solve security check' }),
      );
      fireEvent.click(screen.getByTestId('login-submit-button'));

      await waitFor(() =>
        expect(authApi.login).toHaveBeenCalledWith(
          expect.objectContaining({ captchaToken: 'captcha-token' }),
        ),
      );
      expect(
        screen.queryByText(i18n!.t('auth.captcha_required')),
      ).not.toBeInTheDocument();
    });

    it('refuses to sign in on a production build that has no security check', () => {
      vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
      vi.stubEnv('PROD', true);
      const { i18n } = renderWithProviders(<Login />);

      fillAndSubmit(i18n!);

      expect(
        screen.getByText(i18n!.t('auth.captcha_unavailable')),
      ).toBeInTheDocument();
      expect(authApi.login).not.toHaveBeenCalled();
    });
  });

  describe('two-step verification', () => {
    async function reachCodeStep(i18n: I18nInstance) {
      vi.mocked(authApi.login).mockRejectedValueOnce({
        response: { data: { message: '2FA_REQUIRED' } },
      });
      fillAndSubmit(i18n);
      return screen.findByLabelText(i18n.t('auth.login.2fa_code'));
    }

    it('signs in with the code once all six digits are typed', async () => {
      const { i18n } = renderWithProviders(<Login />);
      const codeInput = await reachCodeStep(i18n!);

      fireEvent.change(codeInput, { target: { value: '12345' } });
      expect(authApi.login).toHaveBeenCalledTimes(1);

      fireEvent.change(codeInput, { target: { value: '123 456' } });

      await waitFor(() =>
        expect(authApi.login).toHaveBeenLastCalledWith(
          expect.objectContaining({
            identifier: 'user@example.com',
            password: 'password123',
            twoFactorCode: '123456',
          }),
        ),
      );
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    });

    it('returns to the sign-in form from the code step', async () => {
      const { i18n } = renderWithProviders(<Login />);
      await reachCodeStep(i18n!);

      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('auth.login.back_to_login'),
        }),
      );

      expect(
        await screen.findByTestId('login-submit-button'),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText(i18n!.t('auth.login.2fa_code')),
      ).not.toBeInTheDocument();
    });
  });

  describe('passkey sign-in', () => {
    function clickPasskey(i18n: I18nInstance) {
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('auth.login.passkey_btn') }),
      );
    }

    it('asks for the email or username first', () => {
      const { i18n } = renderWithProviders(<Login />);

      clickPasskey(i18n!);

      expect(
        screen.getByText(i18n!.t('auth.login.no_identifier')),
      ).toBeInTheDocument();
      expect(passkeyApi.getLoginOptions).not.toHaveBeenCalled();
    });

    it('signs in with the passkey the browser returns', async () => {
      vi.mocked(passkeyApi.getLoginOptions).mockResolvedValue({
        data: { challenge: 'c' },
      } as never);
      vi.mocked(startAuthentication).mockResolvedValue({ id: 'cred' } as never);
      vi.mocked(passkeyApi.verifyLogin).mockResolvedValue({} as never);
      const { i18n } = renderWithProviders(<Login />);
      fireEvent.change(
        screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
        { target: { value: 'testuser' } },
      );

      clickPasskey(i18n!);

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
      expect(passkeyApi.getLoginOptions).toHaveBeenCalledWith('testuser');
      expect(startAuthentication).toHaveBeenCalledWith({
        optionsJSON: { challenge: 'c' },
      });
      expect(passkeyApi.verifyLogin).toHaveBeenCalledWith('testuser', {
        id: 'cred',
      });
      expect(authApi.login).not.toHaveBeenCalled();
    });

    it('explains a failed passkey in the app language, not the browser text', async () => {
      vi.mocked(passkeyApi.getLoginOptions).mockResolvedValue({
        data: { challenge: 'c' },
      } as never);
      vi.mocked(startAuthentication).mockRejectedValue(
        new Error('The operation either timed out or was not allowed.'),
      );
      const { i18n } = renderWithProviders(<Login />);
      fireEvent.change(
        screen.getByLabelText(i18n!.t('auth.login.identifier_label')),
        { target: { value: 'testuser' } },
      );

      clickPasskey(i18n!);

      expect(
        await screen.findByText(i18n!.t('auth.login.passkey_error')),
      ).toBeInTheDocument();
      expect(screen.queryByText(/timed out/)).not.toBeInTheDocument();
      expect(passkeyApi.verifyLogin).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('appeal from the sign-in page', () => {
    async function reachAppealForm(i18n: I18nInstance) {
      vi.mocked(authApi.login).mockRejectedValueOnce(BANNED_WITH_TOKEN);
      fillAndSubmit(i18n, 'banned@example.com');
      return screen.findByLabelText(i18n.t('auth.login.appeal_reason_label'));
    }

    it('sends the appeal with the token of the refused sign-in and returns to the form', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
      const { i18n } = renderWithProviders(<Login />);
      const reason = await reachAppealForm(i18n!);
      const submit = screen.getByRole('button', {
        name: i18n!.t('auth.login.submit_appeal'),
      });

      fireEvent.change(reason, { target: { value: 'too short' } });
      expect(submit).toBeDisabled();

      fireEvent.change(reason, {
        target: { value: 'This was a mistake, please review.' },
      });
      fireEvent.click(submit);

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          i18n!.t('auth.login.appeal_success'),
        ),
      );
      expect(apiClient.post).toHaveBeenCalledWith(
        '/appeals',
        {
          targetType: 'ACCOUNT_BAN',
          reason: 'This was a mistake, please review.',
        },
        { headers: { 'x-appeal-token': 'appeal-token-1' } },
      );
      expect(
        await screen.findByTestId('login-submit-button'),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText(i18n!.t('auth.login.appeal_reason_label')),
      ).not.toBeInTheDocument();
    });

    it('keeps the appeal on screen and says so when it cannot be sent', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(
        Object.assign(new Error('Internal server error'), { status: 400 }),
      );
      const { i18n } = renderWithProviders(<Login />);
      const reason = await reachAppealForm(i18n!);

      fireEvent.change(reason, {
        target: { value: 'This was a mistake, please review.' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('auth.login.submit_appeal'),
        }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n!.t('auth.login.appeal_error'),
        ),
      );
      expect(reason).toHaveValue('This was a mistake, please review.');
    });

    it('returns to the sign-in form without appealing', async () => {
      const { i18n } = renderWithProviders(<Login />);
      await reachAppealForm(i18n!);

      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('auth.login.back_to_login'),
        }),
      );

      expect(
        await screen.findByTestId('login-submit-button'),
      ).toBeInTheDocument();
      expect(apiClient.post).not.toHaveBeenCalled();
    });
  });
});
