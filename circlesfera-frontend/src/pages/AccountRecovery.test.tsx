import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import VerifyEmail from './VerifyEmail';

vi.mock('../services', () => ({
  authApi: {
    requestReset: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
  },
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

// The error the API client rejects with: the server text must never show.
const apiError = (status: number) =>
  Object.assign(new Error('server text, never shown'), { status, data: {} });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPassword', () => {
  it('asks for a reset link and confirms where it was sent', async () => {
    vi.mocked(authApi.requestReset).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(<ForgotPassword />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.forgot_password.email_label')),
      { target: { value: 'ana@example.com' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('auth.forgot_password.submit'),
      }),
    );

    expect(
      await screen.findByText(i18n!.t('auth.forgot_password.success_title')),
    ).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(authApi.requestReset).toHaveBeenCalledWith('ana@example.com');
  });

  it('shows its own message when the request fails', async () => {
    vi.mocked(authApi.requestReset).mockRejectedValue(apiError(500));
    const { i18n } = renderWithProviders(<ForgotPassword />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('auth.forgot_password.email_label')),
      { target: { value: 'ana@example.com' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('auth.forgot_password.submit'),
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/server text/)).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText(i18n!.t('auth.forgot_password.success_title')),
    ).not.toBeInTheDocument();
  });
});

describe('ResetPassword', () => {
  const fill = (i18n: { t: (k: string) => string }, a: string, b: string) => {
    fireEvent.change(
      screen.getByLabelText(i18n.t('auth.reset_password.new_password')),
      { target: { value: a } },
    );
    fireEvent.change(
      screen.getByLabelText(i18n.t('auth.reset_password.confirm_password')),
      { target: { value: b } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('auth.reset_password.submit'),
      }),
    );
  };
  const atReset = (search: string) => ({
    routerProps: { initialEntries: [`/reset-password${search}`] },
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses passwords that do not match', async () => {
    const { i18n } = renderWithProviders(
      <ResetPassword />,
      atReset('?token=t'),
    );

    fill(i18n!, 'secret123', 'secret124');

    expect(
      await screen.findByText(i18n!.t('auth.reset_password.error_mismatch')),
    ).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it('refuses a link without a token', async () => {
    const { i18n } = renderWithProviders(<ResetPassword />, atReset(''));

    fill(i18n!, 'secret123', 'secret123');

    expect(
      await screen.findByText(i18n!.t('auth.reset_password.error_token')),
    ).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it('sets the new password and goes to sign in', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(authApi.resetPassword).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(
      <ResetPassword />,
      atReset('?token=t'),
    );

    fill(i18n!, 'secret123', 'secret123');

    expect(
      await screen.findByText(i18n!.t('auth.reset_password.success_title')),
    ).toBeInTheDocument();
    expect(authApi.resetPassword).toHaveBeenCalledWith({
      token: 't',
      newPassword: 'secret123',
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(navigate).toHaveBeenCalledWith('/accounts/login');
  });

  it('stays on the form with its own message when the token is refused', async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValue(apiError(400));
    const { i18n } = renderWithProviders(
      <ResetPassword />,
      atReset('?token=t'),
    );

    fill(i18n!, 'secret123', 'secret123');

    expect(
      await screen.findByText(i18n!.t('auth.reset_password.default_error')),
    ).toBeInTheDocument();
    expect(screen.queryByText(/server text/)).not.toBeInTheDocument();
  });
});

describe('VerifyEmail', () => {
  const atVerify = (search: string) => ({
    routerProps: { initialEntries: [`/verify-email${search}`] },
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says the link is incomplete without a token, without calling the server', async () => {
    const { i18n } = renderWithProviders(<VerifyEmail />, atVerify(''));

    expect(
      await screen.findByText(i18n!.t('auth.verify.no_token')),
    ).toBeInTheDocument();
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });

  it('verifies the email and goes home', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(authApi.verifyEmail).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(<VerifyEmail />, atVerify('?token=t'));

    expect(
      await screen.findByText(i18n!.t('auth.verify.success_title')),
    ).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledWith('t');
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows its own message when the token is refused', async () => {
    vi.mocked(authApi.verifyEmail).mockRejectedValue(apiError(400));
    const { i18n } = renderWithProviders(<VerifyEmail />, atVerify('?token=t'));

    expect(
      await screen.findByText(i18n!.t('auth.verify.error_title')),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('auth.verify.error'))).toBeInTheDocument();
    expect(screen.queryByText(/server text/)).not.toBeInTheDocument();
  });
});
