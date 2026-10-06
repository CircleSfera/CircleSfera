import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersApi } from '../services/users.service';
import { useAuthStore } from '../stores/authStore';
import { createTestI18n } from '../test/test-utils';
import { toAppLocale } from '../utils/appLocale';
import { useAccountLocaleSync } from './useAccountLocaleSync';

vi.mock('../services/users.service', () => ({
  usersApi: { updateLocale: vi.fn() },
}));

const signedIn = (locale: 'en' | 'es' | undefined) =>
  useAuthStore.setState({
    isAuthenticated: true,
    isSessionChecked: true,
    profile: { id: 'p', user: { id: 'u', createdAt: '', locale } } as never,
  });

function setup(lng: 'en' | 'es') {
  const i18n = createTestI18n(lng);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
  );
  renderHook(() => useAccountLocaleSync(), { wrapper });
  return i18n;
}

describe('useAccountLocaleSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.updateLocale).mockResolvedValue({} as never);
  });

  it('sends the app language when the account has another one', async () => {
    signedIn('es');
    setup('en');

    await waitFor(() =>
      expect(usersApi.updateLocale).toHaveBeenCalledWith('en'),
    );
    await waitFor(() =>
      expect(useAuthStore.getState().profile?.user?.locale).toBe('en'),
    );
  });

  it('does nothing when the account already matches', async () => {
    signedIn('es');
    setup('es');

    await new Promise((r) => setTimeout(r, 0));
    expect(usersApi.updateLocale).not.toHaveBeenCalled();
  });

  it('follows a language change in the app', async () => {
    signedIn('en');
    const i18n = setup('en');
    expect(usersApi.updateLocale).not.toHaveBeenCalled();

    await act(async () => {
      await i18n.changeLanguage('es');
    });

    await waitFor(() =>
      expect(usersApi.updateLocale).toHaveBeenCalledWith('es'),
    );
  });

  it('waits for a confirmed session and never calls signed out', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isSessionChecked: false,
      profile: null,
    });
    setup('en');
    useAuthStore.setState({ isAuthenticated: false, isSessionChecked: true });

    await new Promise((r) => setTimeout(r, 0));
    expect(usersApi.updateLocale).not.toHaveBeenCalled();
  });

  it('a failed update is retried on the next change, not thrown', async () => {
    vi.mocked(usersApi.updateLocale).mockRejectedValue(new Error('down'));
    signedIn('es');
    setup('en');

    await waitFor(() => expect(usersApi.updateLocale).toHaveBeenCalled());
    expect(useAuthStore.getState().profile?.user?.locale).toBe('es');
  });
});

describe('toAppLocale', () => {
  it.each([
    ['es', 'es'],
    ['es-419', 'es'],
    ['ES', 'es'],
    ['en-GB', 'en'],
    ['fr', 'en'],
    [undefined, 'en'],
  ])('%s → %s', (tag, locale) => {
    expect(toAppLocale(tag)).toBe(locale);
  });
});
