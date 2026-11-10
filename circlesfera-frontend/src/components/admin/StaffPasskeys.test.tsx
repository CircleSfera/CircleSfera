import { startRegistration } from '@simplewebauthn/browser';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AdminMe, adminAuthApi } from '../../services/admin-auth.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { renderWithProviders } from '../../test/test-utils';
import { StaffPasskeyNotice, StaffPasskeysDialog } from './StaffPasskeys';

vi.mock('@simplewebauthn/browser', () => ({ startRegistration: vi.fn() }));
vi.mock('../../services/admin-auth.service', () => ({
  adminAuthApi: {
    listPasskeys: vi.fn(),
    passkeyRegisterOptions: vi.fn(),
    registerPasskey: vi.fn(),
    removePasskey: vi.fn(),
    stepUp: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const staff = (over: Partial<AdminMe> = {}): AdminMe => ({
  id: 'admin-1',
  email: 'staff@example.com',
  displayName: 'Staff',
  totpEnabled: true,
  passkeyCount: 0,
  roles: ['SUPPORT_ADMIN'],
  permissions: [],
  ...over,
});
const signIn = (admin: AdminMe | null) =>
  useAdminAuthStore.setState({ admin, isAuthenticated: !!admin });

const stepUpNeeded = {
  isAxiosError: true,
  response: { status: 401, data: { code: 'ADMIN_STEP_UP_REQUIRED' } },
};

describe('StaffPasskeyNotice', () => {
  it('asks a member of staff with no passkey to add one', () => {
    signIn(staff());
    vi.mocked(adminAuthApi.listPasskeys).mockResolvedValue({
      data: [],
    } as never);
    const { i18n } = renderWithProviders(<StaffPasskeyNotice />);

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('adminPanel.passkeys.notice_action'),
      }),
    );
    expect(
      screen.getByRole('dialog', {
        name: i18n!.t('adminPanel.passkeys.title'),
      }),
    ).toBeInTheDocument();
  });

  it('keeps the dialog open after the first passkey is added, when the notice goes', async () => {
    signIn(staff());
    vi.mocked(adminAuthApi.listPasskeys).mockResolvedValue({
      data: [],
    } as never);
    const { i18n } = renderWithProviders(<StaffPasskeyNotice />);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('adminPanel.passkeys.notice_action'),
      }),
    );

    // The first passkey arrives: the notice goes, the dialog stays.
    act(() => signIn(staff({ passkeyCount: 1 })));

    expect(
      screen.queryByText(i18n!.t('adminPanel.passkeys.notice_title')),
    ).toBeNull();
    expect(
      screen.getByRole('dialog', {
        name: i18n!.t('adminPanel.passkeys.title'),
      }),
    ).toBeInTheDocument();
  });

  it('shows nothing for a reviewer, with a passkey, or before who it is is known', () => {
    for (const admin of [
      staff({ externalReviewer: true }),
      staff({ passkeyCount: 1 }),
      staff({ passkeyCount: undefined }),
      null,
    ]) {
      signIn(admin);
      const { container, unmount } = renderWithProviders(
        <StaffPasskeyNotice />,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe('StaffPasskeysDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    signIn(staff());
    vi.mocked(adminAuthApi.me).mockResolvedValue({
      data: staff({ passkeyCount: 1 }),
    } as never);
  });

  it('lists the passkeys with when each was used or added', async () => {
    vi.mocked(adminAuthApi.listPasskeys).mockResolvedValue({
      data: [
        {
          id: 'pk-1',
          name: 'Laptop',
          createdAt: '2026-11-01T10:00:00Z',
          lastUsedAt: '2026-11-09T10:00:00Z',
        },
        {
          id: 'pk-2',
          name: null,
          createdAt: '2026-11-02T10:00:00Z',
          lastUsedAt: null,
        },
      ],
    } as never);
    const { i18n } = renderWithProviders(
      <StaffPasskeysDialog isOpen onClose={onClose} />,
    );

    expect(await screen.findByText('Laptop')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('adminPanel.passkeys.unnamed')),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/2026/, { selector: 'p' })).toHaveLength(2);
  });

  it('adds a passkey after the authenticator code, with its name, and reloads the count', async () => {
    vi.mocked(adminAuthApi.listPasskeys).mockResolvedValue({
      data: [],
    } as never);
    vi.mocked(adminAuthApi.passkeyRegisterOptions)
      .mockRejectedValueOnce(stepUpNeeded)
      .mockResolvedValue({ data: { challenge: 'c' } } as never);
    vi.mocked(adminAuthApi.stepUp).mockResolvedValue({} as never);
    vi.mocked(startRegistration).mockResolvedValue({ id: 'cred' } as never);
    vi.mocked(adminAuthApi.registerPasskey).mockResolvedValue({
      data: { id: 'pk-new' },
    } as never);
    const { i18n } = renderWithProviders(
      <StaffPasskeysDialog isOpen onClose={onClose} />,
    );
    await screen.findByText(i18n!.t('adminPanel.passkeys.none'));

    fireEvent.change(
      screen.getByLabelText(i18n!.t('adminPanel.passkeys.name')),
      { target: { value: '  Phone ' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('adminPanel.passkeys.add') }),
    );
    // The step-up dialog asks for the code; then the passkey is created
    // with a click of its own, which the browser needs for its prompt.
    fireEvent.change(await screen.findByPlaceholderText('000000'), {
      target: { value: '123456' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.operators.confirm') }),
    );
    const createButton = await screen.findByRole('button', {
      name: i18n!.t('adminPanel.passkeys.create'),
    });
    expect(startRegistration).not.toHaveBeenCalled();
    fireEvent.click(createButton);

    await waitFor(() =>
      expect(adminAuthApi.registerPasskey).toHaveBeenCalledWith(
        { id: 'cred' },
        'Phone',
      ),
    );
    expect(startRegistration).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'c' },
    });
    await waitFor(() =>
      expect(useAdminAuthStore.getState().admin?.passkeyCount).toBe(1),
    );
    expect(toast.success).toHaveBeenCalledWith(
      i18n!.t('adminPanel.passkeys.added'),
    );
  });

  it('says so when the passkey prompt is closed, and when adding fails', async () => {
    vi.mocked(adminAuthApi.listPasskeys).mockResolvedValue({
      data: [],
    } as never);
    vi.mocked(adminAuthApi.passkeyRegisterOptions).mockResolvedValue({
      data: {},
    } as never);
    const closed = Object.assign(new Error('closed'), {
      name: 'NotAllowedError',
    });
    vi.mocked(startRegistration)
      .mockRejectedValueOnce(closed)
      .mockRejectedValueOnce(new Error('other'));
    const { i18n } = renderWithProviders(
      <StaffPasskeysDialog isOpen onClose={onClose} />,
    );
    await screen.findByText(i18n!.t('adminPanel.passkeys.none'));
    const tryOnce = async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('adminPanel.passkeys.add'),
        }),
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n!.t('adminPanel.passkeys.create'),
        }),
      );
    };
    await tryOnce();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('adminPanel.passkeys.cancelled'),
      ),
    );
    // Options are used once: another try starts with new ones.
    await tryOnce();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('adminPanel.passkeys.error'),
      ),
    );
    expect(adminAuthApi.passkeyRegisterOptions).toHaveBeenCalledTimes(2);
    expect(adminAuthApi.registerPasskey).not.toHaveBeenCalled();
  });

  it('removes a passkey, and stays quiet when the code is not given', async () => {
    vi.mocked(adminAuthApi.listPasskeys).mockResolvedValue({
      data: [
        {
          id: 'pk-1',
          name: 'Laptop',
          createdAt: '2026-11-01T10:00:00Z',
          lastUsedAt: null,
        },
      ],
    } as never);
    vi.mocked(adminAuthApi.removePasskey)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(stepUpNeeded);
    const { i18n } = renderWithProviders(
      <StaffPasskeysDialog isOpen onClose={onClose} />,
    );
    const remove = await screen.findByRole('button', {
      name: i18n!.t('adminPanel.passkeys.remove', { name: 'Laptop' }),
    });

    fireEvent.click(remove);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        i18n!.t('adminPanel.passkeys.removed'),
      ),
    );
    expect(adminAuthApi.removePasskey).toHaveBeenCalledWith('pk-1');

    fireEvent.click(remove);
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('admin.shared.cancel'),
      }),
    );
    await waitFor(() => expect(remove).toBeEnabled());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says the list could not be loaded, offers no new passkey meanwhile, and tries again', async () => {
    vi.mocked(adminAuthApi.listPasskeys)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ data: [] } as never);
    const { i18n } = renderWithProviders(
      <StaffPasskeysDialog isOpen onClose={onClose} />,
    );

    expect(
      await screen.findByText(i18n!.t('adminPanel.passkeys.load_error')),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('adminPanel.passkeys.add'),
      }),
    ).toBeNull();
    expect(screen.queryByText(i18n!.t('adminPanel.passkeys.none'))).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('common.try_again') }),
    );
    expect(
      await screen.findByText(i18n!.t('adminPanel.passkeys.none')),
    ).toBeInTheDocument();
  });

  it('asks the code again when it expired before the passkey is registered, and sends the same answer', async () => {
    vi.mocked(adminAuthApi.listPasskeys).mockResolvedValue({
      data: [],
    } as never);
    vi.mocked(adminAuthApi.passkeyRegisterOptions).mockResolvedValue({
      data: { challenge: 'c' },
    } as never);
    vi.mocked(startRegistration).mockResolvedValue({ id: 'cred' } as never);
    vi.mocked(adminAuthApi.registerPasskey)
      .mockRejectedValueOnce(stepUpNeeded)
      .mockResolvedValue({ data: { id: 'pk-new' } } as never);
    vi.mocked(adminAuthApi.stepUp).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(
      <StaffPasskeysDialog isOpen onClose={onClose} />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('adminPanel.passkeys.add'),
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('adminPanel.passkeys.create'),
      }),
    );

    fireEvent.change(await screen.findByPlaceholderText('000000'), {
      target: { value: '123456' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.operators.confirm') }),
    );

    await waitFor(() =>
      expect(adminAuthApi.registerPasskey).toHaveBeenCalledTimes(2),
    );
    expect(startRegistration).toHaveBeenCalledTimes(1);
    expect(vi.mocked(adminAuthApi.registerPasskey).mock.calls[1][0]).toEqual({
      id: 'cred',
    });
  });

  it('offers no new passkey once the limit is reached', async () => {
    vi.mocked(adminAuthApi.listPasskeys).mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => ({
        id: `pk-${i}`,
        name: `Key ${i}`,
        createdAt: '2026-11-01T10:00:00Z',
        lastUsedAt: null,
      })),
    } as never);
    const { i18n } = renderWithProviders(
      <StaffPasskeysDialog isOpen onClose={onClose} />,
    );

    expect(
      await screen.findByText(i18n!.t('adminPanel.passkeys.full', { max: 5 })),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('adminPanel.passkeys.add'),
      }),
    ).toBeNull();
  });

  it('keeps the change when who is signed in cannot be reloaded', async () => {
    vi.mocked(adminAuthApi.listPasskeys).mockResolvedValue({
      data: [
        {
          id: 'pk-1',
          name: 'L',
          createdAt: '2026-11-01T10:00:00Z',
          lastUsedAt: null,
        },
      ],
    } as never);
    vi.mocked(adminAuthApi.removePasskey).mockResolvedValue({} as never);
    vi.mocked(adminAuthApi.me).mockRejectedValue(new Error('down'));
    const { i18n } = renderWithProviders(
      <StaffPasskeysDialog isOpen onClose={onClose} />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('adminPanel.passkeys.remove', { name: 'L' }),
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });
});
