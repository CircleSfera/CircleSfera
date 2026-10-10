import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../services/auth.service';
import { useAuthStore } from '../stores/authStore';
import { renderWithProviders } from '../test/test-utils';
import type { ProfileWithUser } from '../types';
import { TwoFactorSettings } from './TwoFactorSettings';

vi.mock('../services/auth.service', () => ({
  authApi: {
    generate2fa: vi.fn(),
    enable2fa: vi.fn(),
    disable2fa: vi.fn(),
  },
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const me: ProfileWithUser = {
  id: 'me-1',
  userId: 'user-me',
  username: 'me',
  fullName: 'Me',
  bio: null,
  avatar: null,
  standardUrl: null,
  thumbnailUrl: null,
  website: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  user: {
    id: 'user-me',
    email: 'me@example.com',
    isTwoFactorEnabled: false,
    createdAt: new Date(),
  },
};

function mockAuth(profile: ProfileWithUser = me) {
  vi.mocked(useAuthStore).mockImplementation((selector) =>
    selector({
      profile,
      isAuthenticated: true,
      isCreatorModeActive: false,
      isSessionChecked: true,
      isCheckingSession: false,
      setCreatorMode: vi.fn(),
      setAuthenticated: vi.fn(),
      setProfile: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      checkSession: vi.fn().mockResolvedValue(undefined),
    }),
  );
}

describe('TwoFactorSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(authApi.generate2fa).mockResolvedValue({
      data: {
        secret: 'SECRET',
        qrCodeDataUrl: 'data:image/png;base64,qr',
      },
    } as never);
  });

  it('uses catalog copy, not English fallbacks as the source of truth', () => {
    const { i18n } = renderWithProviders(<TwoFactorSettings />);

    expect(i18n!.t('settings.security.2fa.title')).toBe(
      'Two-Factor Authentication (TOTP)',
    );
    expect(
      screen.getByRole('heading', {
        name: i18n!.t('settings.security.2fa.title'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('settings.security.2fa.status_disabled')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('settings.security.2fa.setup_btn'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Autenticación en dos factores (TOTP)'),
    ).not.toBeInTheDocument();
  });

  it('labels the authenticator QR from the catalog', async () => {
    const { i18n } = renderWithProviders(<TwoFactorSettings />);

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.security.2fa.setup_btn'),
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByAltText(i18n!.t('settings.security.2fa.qr_alt')),
      ).toBeInTheDocument();
    });
    expect(i18n!.t('settings.security.2fa.qr_alt')).toBe(
      'Authenticator QR code',
    );
    expect(screen.queryByAltText('2FA QR Code')).not.toBeInTheDocument();
  });

  it('uses Spanish catalog copy', () => {
    const { i18n } = renderWithProviders(<TwoFactorSettings />, { lng: 'es' });

    expect(i18n!.t('settings.security.2fa.title')).toBe(
      'Autenticación en dos factores (TOTP)',
    );
    expect(
      screen.getByRole('heading', {
        name: i18n!.t('settings.security.2fa.title'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('settings.security.2fa.setup_btn'),
      }),
    ).toBeInTheDocument();
  });

  const code = () => screen.getByRole('textbox', { name: '6-digit code' });

  describe('turning it on', () => {
    async function showQr() {
      renderWithProviders(<TwoFactorSettings />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Set Up Authenticator App' }),
      );
      await screen.findByAltText('Authenticator QR code');
    }

    it('sends the typed code and says it is on', async () => {
      vi.mocked(authApi.enable2fa).mockResolvedValue({ data: {} } as never);
      await showQr();

      fireEvent.change(code(), { target: { value: '12a34 56' } });
      expect(code()).toHaveValue('123456');
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Two-Factor Authentication enabled!',
        ),
      );
      expect(authApi.enable2fa).toHaveBeenCalledWith({ code: '123456' });
      expect(
        screen.queryByAltText('Authenticator QR code'),
      ).not.toBeInTheDocument();
    });

    it('does not send a code that is not six digits', async () => {
      await showQr();

      fireEvent.change(code(), { target: { value: '123' } });

      expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
      fireEvent.submit(code());
      expect(authApi.enable2fa).not.toHaveBeenCalled();
    });

    it('says the code is wrong when the server refuses it', async () => {
      vi.mocked(authApi.enable2fa).mockRejectedValue({
        response: { status: 400 },
      });
      await showQr();

      fireEvent.change(code(), { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Invalid verification code'),
      );
      expect(screen.getByAltText('Authenticator QR code')).toBeInTheDocument();
    });

    it('says so when the QR cannot be made', async () => {
      vi.mocked(authApi.generate2fa).mockRejectedValue(new Error('down'));
      renderWithProviders(<TwoFactorSettings />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Set Up Authenticator App' }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Failed to generate 2FA secret',
        ),
      );
    });
  });

  describe('turning it off', () => {
    const on: ProfileWithUser = {
      ...me,
      user: { ...me.user!, isTwoFactorEnabled: true },
    };
    const off = () => screen.getByRole('button', { name: 'Disable 2FA' });

    beforeEach(() => mockAuth(on));

    it('asks for a current code before anything is sent', () => {
      renderWithProviders(<TwoFactorSettings />);
      expect(
        screen.getByText('Your account is secured with 2FA.'),
      ).toBeInTheDocument();

      fireEvent.click(off());

      expect(code()).toBeInTheDocument();
      expect(
        screen.getByText(/Enter a code from your authenticator app/),
      ).toBeInTheDocument();
      expect(off()).toBeDisabled();
      expect(authApi.disable2fa).not.toHaveBeenCalled();
    });

    it('sends the code and says it is off', async () => {
      vi.mocked(authApi.disable2fa).mockResolvedValue({ data: {} } as never);
      renderWithProviders(<TwoFactorSettings />);

      fireEvent.click(off());
      fireEvent.change(code(), { target: { value: '654321' } });
      fireEvent.click(off());

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Two-Factor Authentication disabled',
        ),
      );
      expect(authApi.disable2fa).toHaveBeenCalledWith({ code: '654321' });
      expect(
        screen.queryByRole('textbox', { name: '6-digit code' }),
      ).not.toBeInTheDocument();
    });

    it.each([
      [400, 'Invalid verification code'],
      [500, 'Failed to disable 2FA'],
    ])(
      'keeps the form and explains a refusal with status %s',
      async (status, message) => {
        vi.mocked(authApi.disable2fa).mockRejectedValue({
          response: { status },
        });
        renderWithProviders(<TwoFactorSettings />);

        fireEvent.click(off());
        fireEvent.change(code(), { target: { value: '000000' } });
        fireEvent.click(off());

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
        expect(code()).toBeInTheDocument();
      },
    );

    it('can be left without turning anything off', () => {
      renderWithProviders(<TwoFactorSettings />);

      fireEvent.click(off());
      fireEvent.change(code(), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(
        screen.queryByRole('textbox', { name: '6-digit code' }),
      ).not.toBeInTheDocument();
      expect(authApi.disable2fa).not.toHaveBeenCalled();
      fireEvent.click(off());
      expect(code()).toHaveValue('');
    });
  });
});
