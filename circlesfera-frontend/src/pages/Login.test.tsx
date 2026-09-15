import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, profileApi } from '../services';
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

vi.mock('../components/auth/TurnstileWidget', () => ({
  default: () => null,
}));

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
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: { data: { message: 'Invalid credentials' } },
    });

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

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
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

  it('shows appeal chrome from the catalog when banned with token', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: {
        data: {
          message: 'ACCOUNT_BANNED',
          appealToken: 'appeal-token-1',
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
});
