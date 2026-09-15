import { fireEvent, screen, waitFor } from '@testing-library/react';
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
});
