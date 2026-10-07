import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import PasskeySettings from './PasskeySettings';

vi.mock('../../services', () => ({
  passkeyApi: {
    listPasskeys: vi.fn(),
    getRegistrationOptions: vi.fn(),
    verifyRegistration: vi.fn(),
    getStepUpOptions: vi.fn(),
    deletePasskey: vi.fn(),
  },
}));

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { passkeyApi } from '../../services';

const ONE_KEY = {
  data: [
    {
      id: 'pk-1',
      credentialID: 'cred-abcdefghijklmnopqrstuvwxyz',
      transports: [],
      createdAt: '2026-01-15T00:00:00.000Z',
    },
  ],
};

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

  it('confirms with the passkey before removing it', async () => {
    vi.mocked(passkeyApi.listPasskeys).mockResolvedValue(ONE_KEY as never);
    vi.mocked(passkeyApi.getStepUpOptions).mockResolvedValue({
      data: { challenge: 'c' },
    } as never);
    vi.mocked(startAuthentication).mockResolvedValue({ id: 'cred' } as never);
    vi.mocked(passkeyApi.deletePasskey).mockResolvedValue({} as never);

    const { i18n } = renderWithProviders(<PasskeySettings />);
    const remove = await screen.findByRole('button', {
      name: i18n!.t('settings.passkey_settings.remove'),
    });
    fireEvent.click(remove);

    await waitFor(() => {
      expect(passkeyApi.deletePasskey).toHaveBeenCalledWith('pk-1', {
        id: 'cred',
      });
    });
    expect(startAuthentication).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'c' },
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: i18n!.t('settings.passkey_settings.remove'),
        }),
      ).not.toBeInTheDocument();
    });
  });

  it('keeps the passkey and explains when the confirmation is cancelled', async () => {
    vi.mocked(passkeyApi.listPasskeys).mockResolvedValue(ONE_KEY as never);
    vi.mocked(passkeyApi.getStepUpOptions).mockResolvedValue({
      data: { challenge: 'c' },
    } as never);
    vi.mocked(startAuthentication).mockRejectedValue(new Error('cancelled'));

    const { i18n } = renderWithProviders(<PasskeySettings />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.passkey_settings.remove'),
      }),
    );

    expect(
      await screen.findByText(
        i18n!.t('settings.passkey_settings.remove_error'),
      ),
    ).toBeInTheDocument();
    expect(passkeyApi.deletePasskey).not.toHaveBeenCalled();
  });

  it('adds a passkey after the browser creates it and lists it', async () => {
    vi.mocked(passkeyApi.getRegistrationOptions).mockResolvedValue({
      data: { challenge: 'r' },
    } as never);
    vi.mocked(startRegistration).mockResolvedValue({ id: 'new' } as never);
    vi.mocked(passkeyApi.verifyRegistration).mockResolvedValue({
      data: { verified: true },
    } as never);
    const { i18n } = renderWithProviders(<PasskeySettings />);
    await screen.findByText(i18n!.t('settings.passkey_settings.empty'));
    vi.mocked(passkeyApi.listPasskeys).mockResolvedValue(ONE_KEY as never);

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.passkey_settings.add_new'),
      }),
    );

    expect(
      await screen.findByText(i18n!.t('settings.passkey_settings.success')),
    ).toBeInTheDocument();
    expect(startRegistration).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'r' },
    });
    expect(passkeyApi.verifyRegistration).toHaveBeenCalledWith({ id: 'new' });
    expect(
      await screen.findByRole('button', {
        name: i18n!.t('settings.passkey_settings.remove'),
      }),
    ).toBeInTheDocument();
  });

  it('explains a failed registration in the app language, not the browser text', async () => {
    vi.mocked(passkeyApi.getRegistrationOptions).mockResolvedValue({
      data: { challenge: 'r' },
    } as never);
    vi.mocked(startRegistration).mockRejectedValue(
      new Error('The operation either timed out or was not allowed.'),
    );
    const { i18n } = renderWithProviders(<PasskeySettings />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.passkey_settings.add_new'),
      }),
    );

    expect(
      await screen.findByText(
        i18n!.t('settings.passkey_settings.register_error'),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/timed out/)).not.toBeInTheDocument();
    expect(passkeyApi.verifyRegistration).not.toHaveBeenCalled();
  });

  it('still shows the screen when the passkeys cannot be listed', async () => {
    vi.mocked(passkeyApi.listPasskeys).mockRejectedValue(new Error('down'));
    const { i18n } = renderWithProviders(<PasskeySettings />);

    expect(
      await screen.findByText(i18n!.t('settings.passkey_settings.empty')),
    ).toBeInTheDocument();
  });
});
