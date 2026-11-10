import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AdminMe, adminAuthApi } from '../../services/admin-auth.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { renderWithProviders } from '../../test/test-utils';
import { StaffPasswordDialog, StaffPasswordNotice } from './StaffPassword';

vi.mock('../../services/admin-auth.service', () => ({
  adminAuthApi: { changePassword: vi.fn(), me: vi.fn(), logout: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const LONG = 'a long staff password';

const staff = (over: Partial<AdminMe> = {}): AdminMe => ({
  id: 'admin-1',
  email: 'staff@example.com',
  displayName: 'Staff',
  totpEnabled: true,
  ownPassword: true,
  roles: ['SUPPORT_ADMIN'],
  permissions: [],
  ...over,
});

const signIn = (admin: AdminMe) =>
  useAdminAuthStore.setState({ admin, isAuthenticated: true });

function fill(
  i18n: I18nInstance,
  values: { current?: string; next?: string; repeat?: string; code?: string },
  currentKey = 'adminPanel.password.current',
) {
  const set = (label: string, value?: string) => {
    if (value !== undefined) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
  };
  set(i18n.t(currentKey), values.current);
  set(i18n.t('adminPanel.login.new_password'), values.next);
  set(i18n.t('adminPanel.login.repeat_password'), values.repeat);
  set(i18n.t('adminPanel.login.mfa_code'), values.code);
}

const saveButton = (i18n: I18nInstance) =>
  screen.getByRole('button', { name: i18n.t('adminPanel.password.save') });

describe('StaffPasswordNotice', () => {
  it('asks an identity that still signs in with its account password to set its own', () => {
    signIn(staff({ ownPassword: false }));
    const { i18n } = renderWithProviders(<StaffPasswordNotice />);

    expect(
      screen.getByText(i18n!.t('adminPanel.password.notice_title')),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('adminPanel.password.notice_action'),
      }),
    );
    expect(
      screen.getByText(i18n!.t('adminPanel.password.set_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(i18n!.t('adminPanel.password.current_account')),
    ).toBeInTheDocument();
  });

  it('shows nothing once the identity has its own, nor before it is known', () => {
    signIn(staff());
    const { container } = renderWithProviders(<StaffPasswordNotice />);
    expect(container).toBeEmptyDOMElement();

    useAdminAuthStore.setState({ admin: null });
    const again = renderWithProviders(<StaffPasswordNotice />);
    expect(again.container).toBeEmptyDOMElement();
  });
});

describe('StaffPasswordDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    signIn(staff());
  });

  it('changes the password with the current one and a code, then reloads who is signed in', async () => {
    vi.mocked(adminAuthApi.changePassword).mockResolvedValue({} as never);
    vi.mocked(adminAuthApi.me).mockResolvedValue({
      data: staff({ displayName: 'Reloaded' }),
    } as never);
    const { i18n } = renderWithProviders(
      <StaffPasswordDialog isOpen onClose={onClose} />,
    );

    fill(i18n!, { current: 'old one', next: LONG, repeat: LONG });
    expect(saveButton(i18n!)).toBeDisabled();
    fill(i18n!, { code: '12a3456' });
    fireEvent.click(saveButton(i18n!));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(adminAuthApi.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old one',
      newPassword: LONG,
      totpCode: '123456',
    });
    expect(toast.success).toHaveBeenCalledWith(
      i18n!.t('adminPanel.password.saved'),
    );
    expect(useAdminAuthStore.getState().admin?.displayName).toBe('Reloaded');
  });

  it('closes even when who is signed in cannot be reloaded: the password is saved', async () => {
    vi.mocked(adminAuthApi.changePassword).mockResolvedValue({} as never);
    vi.mocked(adminAuthApi.me).mockRejectedValue(new Error('offline'));
    const { i18n } = renderWithProviders(
      <StaffPasswordDialog isOpen onClose={onClose} />,
    );

    fill(i18n!, { current: 'old', next: LONG, repeat: LONG, code: '123456' });
    fireEvent.click(saveButton(i18n!));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('asks an external reviewer for no code', async () => {
    signIn(staff({ externalReviewer: true, totpEnabled: false }));
    vi.mocked(adminAuthApi.changePassword).mockResolvedValue({} as never);
    vi.mocked(adminAuthApi.me).mockResolvedValue({ data: staff() } as never);
    const { i18n } = renderWithProviders(
      <StaffPasswordDialog isOpen onClose={onClose} />,
    );

    expect(
      screen.queryByLabelText(i18n!.t('adminPanel.login.mfa_code')),
    ).not.toBeInTheDocument();
    fill(i18n!, { current: 'old', next: LONG, repeat: LONG });
    fireEvent.click(saveButton(i18n!));

    await waitFor(() =>
      expect(adminAuthApi.changePassword).toHaveBeenCalledWith({
        currentPassword: 'old',
        newPassword: LONG,
      }),
    );
  });

  it('waits for a long enough new password typed twice the same', () => {
    const { i18n } = renderWithProviders(
      <StaffPasswordDialog isOpen onClose={onClose} />,
    );

    fill(i18n!, {
      current: 'old',
      next: 'short pass',
      repeat: 'short pass',
      code: '123456',
    });
    expect(saveButton(i18n!)).toBeDisabled();
    fill(i18n!, { next: LONG, repeat: `${LONG}!` });
    expect(saveButton(i18n!)).toBeDisabled();
    expect(
      screen.getByText(i18n!.t('adminPanel.login.passwords_differ')),
    ).toBeInTheDocument();
  });

  it.each([
    [401, {}, 'adminPanel.password.wrong'],
    [403, {}, 'adminPanel.login.locked'],
    [400, { errorCode: 'PASSWORD_LEAKED' }, 'errors.codes.PASSWORD_LEAKED'],
  ])(
    'says why a %s was refused and clears the code',
    async (status, data, key) => {
      vi.mocked(adminAuthApi.changePassword).mockRejectedValue({
        isAxiosError: true,
        response: { status, data },
      });
      const { i18n } = renderWithProviders(
        <StaffPasswordDialog isOpen onClose={onClose} />,
      );

      fill(i18n!, { current: 'old', next: LONG, repeat: LONG, code: '123456' });
      fireEvent.click(saveButton(i18n!));

      expect(await screen.findByText(i18n!.t(key))).toBeInTheDocument();
      expect(
        screen.getByLabelText(i18n!.t('adminPanel.login.mfa_code')),
      ).toHaveValue('');
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it('clears what was typed when cancelled', () => {
    const { i18n } = renderWithProviders(
      <StaffPasswordDialog isOpen onClose={onClose} />,
    );
    fill(i18n!, { current: 'old' });

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('admin.shared.cancel') }),
    );

    expect(onClose).toHaveBeenCalled();
    expect(
      screen.getByLabelText(i18n!.t('adminPanel.password.current')),
    ).toHaveValue('');
  });
});
