import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import PasskeySettings from './PasskeySettings';

vi.mock('../../services', () => ({
  passkeyApi: {
    listPasskeys: vi.fn(),
    getRegistrationOptions: vi.fn(),
    verifyRegistration: vi.fn(),
    deletePasskey: vi.fn(),
  },
}));

import { passkeyApi } from '../../services';

describe('PasskeySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(passkeyApi.listPasskeys).mockResolvedValue({ data: [] } as never);
  });

  it('uses catalog copy, not Spanish fallbacks', async () => {
    const { i18n } = renderWithProviders(<PasskeySettings />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: i18n!.t('settings.passkey_settings.title'),
        }),
      ).toBeInTheDocument();
    });
    expect(i18n!.t('settings.passkey_settings.title')).toBe(
      'Security Keys (Passkeys)',
    );
    expect(
      screen.getByText(i18n!.t('settings.passkey_settings.empty')),
    ).toBeInTheDocument();
    expect(screen.queryByText('Biometría y Passkeys')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no tienes ninguna clave passkey/i),
    ).not.toBeInTheDocument();
  });

  it('labels delete from the catalog when a key exists', async () => {
    vi.mocked(passkeyApi.listPasskeys).mockResolvedValue({
      data: [
        {
          id: 'pk-1',
          credentialID: 'cred-abcdefghijklmnopqrstuvwxyz',
          transports: [],
          createdAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    } as never);

    const { i18n } = renderWithProviders(<PasskeySettings />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: i18n!.t('settings.passkey_settings.remove'),
        }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTitle('Eliminar Passkey')).not.toBeInTheDocument();
  });
});
