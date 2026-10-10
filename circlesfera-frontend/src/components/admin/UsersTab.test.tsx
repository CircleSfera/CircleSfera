import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import UsersTab from './UsersTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getUsers: vi.fn(),
    getEnhancedStats: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    updateUserRole: vi.fn(),
    deleteUser: vi.fn(),
    warnUser: vi.fn(),
    suspendUser: vi.fn(),
    restoreUser: vi.fn(),
    exportUsersCSV: vi.fn(),
  },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
vi.mock('../../utils/adminPanel', () => ({
  platformOrigin: () => 'https://platform.test',
}));
vi.mock('./UserDetailPanel', () => ({
  default: ({ userId }: { userId: string }) => (
    <div data-testid="user-detail">{userId}</div>
  ),
}));

const api = vi.mocked(adminApi);
const onToast = vi.fn();
const NOW = new Date('2026-03-10T12:00:00Z');
const inDays = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();

const user = (id: string, over: object = {}) => ({
  id,
  email: `${id}@example.com`,
  role: 'USER',
  isActive: true,
  createdAt: '2026-01-15T10:00:00Z',
  postCount: 3,
  verificationLevel: 'BASIC',
  suspendedUntil: null,
  isTestAccount: false,
  profile: { username: `person_${id}`, avatar: null },
  ...over,
});
const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit: 10,
      totalPages,
    },
  },
});
const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const dialog = () => screen.getByRole('dialog');
const show = (route = '/') =>
  renderWithProviders(<UsersTab onToast={onToast} />, {
    routerProps: { useTransitions: false, initialEntries: [route] },
  });
const choose = async (handle: string, action: string) => {
  const row = await waitFor(() => rowOf(handle));
  fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: action }));
};
const menuOf = async (handle: string) => {
  const row = await waitFor(() => rowOf(handle));
  fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
  return (await screen.findAllByRole('menuitem')).map((item) =>
    item.textContent?.trim(),
  );
};

describe('UsersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    api.getUsers.mockResolvedValue(list([]) as never);
    api.getEnhancedStats.mockResolvedValue({
      users: 12500,
      userGrowth: 4,
      newUsersThisWeek: 320,
      activeUsersToday: 870,
      pendingReports: 9,
    } as never);
    for (const call of [
      api.banUser,
      api.unbanUser,
      api.updateUserRole,
      api.deleteUser,
      api.warnUser,
      api.suspendUser,
      api.restoreUser,
    ]) {
      call.mockResolvedValue({} as never);
    }
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the figures of the user base', async () => {
    show();

    expect(await screen.findByText('12,500')).toBeInTheDocument();
    expect(screen.getByText('320')).toBeInTheDocument();
    expect(screen.getByText('870')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('shows zeros while there are no figures', async () => {
    api.getEnhancedStats.mockResolvedValue({} as never);
    show();

    await screen.findByText('No users');
    expect(screen.getAllByText('0')).toHaveLength(4);
  });

  it('lists each account with its role, posts, state and marks', async () => {
    api.getUsers.mockResolvedValue(
      list([
        user('1'),
        user('2', { role: 'ADMIN', isActive: false, isTestAccount: true }),
        user('3', { suspendedUntil: inDays(3) }),
        user('4', { profile: null }),
      ]) as never,
    );
    show();

    const first = await waitFor(() => rowOf('@person_1'));
    expect(within(first).getByText('1@example.com')).toBeInTheDocument();
    expect(within(first).getByText(/User · 3 posts/)).toBeInTheDocument();
    expect(within(first).getByText('active')).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Ban' })).toBeEnabled();

    const second = rowOf('@person_2');
    expect(within(second).getByText(/Operator · 3 posts/)).toBeInTheDocument();
    expect(within(second).getByText('Test account')).toBeInTheDocument();
    expect(within(second).getByText('banned')).toBeInTheDocument();
    expect(
      within(second).getByRole('button', { name: 'Unban' }),
    ).toBeInTheDocument();

    const third = rowOf('@person_3');
    expect(within(third).getByText(/Suspended until/)).toBeInTheDocument();
    expect(within(third).getByText('banned')).toBeInTheDocument();

    expect(rowOf('@user')).toBeTruthy();
  });

  it('asks for the list by segment, search and page', async () => {
    api.getUsers.mockResolvedValue(list([user('1')], 1, 3) as never);
    show();
    await waitFor(() => rowOf('@person_1'));
    expect(api.getUsers).toHaveBeenLastCalledWith(
      1,
      10,
      undefined,
      undefined,
      undefined,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(api.getUsers).toHaveBeenLastCalledWith(
        2,
        10,
        undefined,
        undefined,
        undefined,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Banned' }));
    await waitFor(() =>
      expect(api.getUsers).toHaveBeenLastCalledWith(
        1,
        10,
        undefined,
        'banned',
        undefined,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Operators' }));
    await waitFor(() =>
      expect(api.getUsers).toHaveBeenLastCalledWith(
        1,
        10,
        undefined,
        undefined,
        'ADMIN',
      ),
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search users...' }), {
      target: { value: 'ana' },
    });
    await waitFor(() =>
      expect(api.getUsers).toHaveBeenLastCalledWith(
        1,
        10,
        'ana',
        undefined,
        'ADMIN',
      ),
    );
  });

  it('offers to clear a search that finds nobody', async () => {
    show();
    await screen.findByText('No users');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search users...' }), {
      target: { value: 'zzz' },
    });
    expect(await screen.findByText('No results')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByText('No users')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Search users...' }),
    ).toHaveValue('');
  });

  it('opens the detail of a row, and the one named in the address', async () => {
    api.getUsers.mockResolvedValue(list([user('1')]) as never);
    show('/?userId=u-77');

    expect(await screen.findByTestId('user-detail')).toHaveTextContent('u-77');

    fireEvent.click(await waitFor(() => rowOf('@person_1')));
    expect(screen.getByTestId('user-detail')).toHaveTextContent('1');

    await choose('@person_1', 'View detail');
    expect(screen.getByTestId('user-detail')).toHaveTextContent('1');
  });

  it('bans only after confirming', async () => {
    api.getUsers.mockResolvedValue(list([user('1')]) as never);
    show();

    const row = await waitFor(() => rowOf('@person_1'));
    fireEvent.click(within(row).getByRole('button', { name: 'Ban' }));
    expect(within(dialog()).getByText('Ban this user?')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.banUser).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole('button', { name: 'Ban' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Ban User' }));
    await waitFor(() => expect(api.banUser).toHaveBeenCalledWith('1'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('User banned', 'success'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('unbans a banned account', async () => {
    api.getUsers.mockResolvedValue(
      list([user('1', { isActive: false })]) as never,
    );
    show();

    const row = await waitFor(() => rowOf('@person_1'));
    fireEvent.click(within(row).getByRole('button', { name: 'Unban' }));
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Unban User' }),
    );

    await waitFor(() => expect(api.unbanUser).toHaveBeenCalledWith('1'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('User unbanned', 'success'),
    );
  });

  it('offers Restore only for a banned or currently suspended account', async () => {
    api.getUsers.mockResolvedValue(
      list([
        user('1'),
        user('2', { suspendedUntil: inDays(2) }),
        user('3', { suspendedUntil: inDays(-2) }),
      ]) as never,
    );
    show();

    expect(await menuOf('@person_1')).not.toContain('Restore');
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    expect(await menuOf('@person_2')).toContain('Restore');
  });

  it('restores a suspended account after confirming', async () => {
    api.getUsers.mockResolvedValue(
      list([user('2', { suspendedUntil: inDays(2) })]) as never,
    );
    show();

    await choose('@person_2', 'Restore');
    expect(
      within(dialog()).getByText(
        'Lift the suspension for @person_2 and reactivate the account.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(api.restoreUser).toHaveBeenCalledWith('2'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('User restored', 'success'),
    );
  });

  it('warns with the reason given, and not at all when the reason is dismissed', async () => {
    api.getUsers.mockResolvedValue(list([user('1')]) as never);
    const ask = vi.spyOn(window, 'prompt').mockReturnValue(null);
    show();

    await choose('@person_1', 'Warn');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    ask.mockReturnValue('  Spam in comments  ');
    await choose('@person_1', 'Warn');
    expect(
      within(dialog()).getByText('Send a formal warning to @person_1.'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Warn' }));

    await waitFor(() =>
      expect(api.warnUser).toHaveBeenCalledWith('1', 'Spam in comments'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Warning issued', 'success'),
    );
  });

  it('warns without a reason when it is left empty', async () => {
    api.getUsers.mockResolvedValue(list([user('1')]) as never);
    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    show();

    await choose('@person_1', 'Warn');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Warn' }));

    await waitFor(() =>
      expect(api.warnUser).toHaveBeenCalledWith('1', undefined),
    );
  });

  it('suspends for the days and reason given, in two steps', async () => {
    api.getUsers.mockResolvedValue(list([user('1')]) as never);
    show();

    await choose('@person_1', 'Suspend');
    expect(
      within(dialog()).getByText('Set duration and reason for @person_1.'),
    ).toBeInTheDocument();
    const days = within(dialog()).getByLabelText('Suspension length in days:');
    expect(days).toHaveValue(7);
    fireEvent.change(days, { target: { value: '14' } });
    fireEvent.change(
      within(dialog()).getByLabelText('Suspension reason (optional):'),
      { target: { value: ' Repeated harassment ' } },
    );
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Suspend' }));

    expect(
      await screen.findByText('@person_1 will be suspended for 14 day(s).'),
    ).toBeInTheDocument();
    expect(api.suspendUser).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Suspend' }));

    await waitFor(() =>
      expect(api.suspendUser).toHaveBeenCalledWith(
        '1',
        14,
        'Repeated harassment',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('User suspended', 'success'),
    );
  });

  it('refuses a suspension without a valid number of days', async () => {
    api.getUsers.mockResolvedValue(list([user('1')]) as never);
    show();

    await choose('@person_1', 'Suspend');
    for (const value of ['0', '', '-3']) {
      fireEvent.change(
        within(dialog()).getByLabelText('Suspension length in days:'),
        { target: { value } },
      );
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'Suspend' }),
      );
    }

    expect(onToast).toHaveBeenCalledTimes(3);
    expect(onToast).toHaveBeenLastCalledWith(
      'Enter a valid number of days (1+)',
      'error',
    );
    expect(
      within(dialog()).getByText('Set duration and reason for @person_1.'),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.suspendUser).not.toHaveBeenCalled();
  });

  it('creates and disables a panel operator after confirming', async () => {
    api.getUsers.mockResolvedValue(
      list([user('1'), user('2', { role: 'ADMIN' })]) as never,
    );
    show();

    await choose('@person_1', 'Create operator');
    expect(
      within(dialog()).getByText(
        'Creates a panel operator for @person_1. Set the password in Operators (or bootstrap-admin).',
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Create operator' }),
    );
    await waitFor(() =>
      expect(api.updateUserRole).toHaveBeenCalledWith('1', 'ADMIN'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await choose('@person_2', 'Disable linked operator');
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Disable operator' }),
    );
    await waitFor(() =>
      expect(api.updateUserRole).toHaveBeenCalledWith('2', 'USER'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('AdminIdentity disabled', 'success'),
    );
  });

  it('deletes an account after confirming and closes its detail', async () => {
    api.getUsers.mockResolvedValue(list([user('1')]) as never);
    show();

    fireEvent.click(await waitFor(() => rowOf('@person_1')));
    expect(screen.getByTestId('user-detail')).toBeInTheDocument();

    await choose('@person_1', 'Delete');
    expect(
      within(dialog()).getByText(/ALL data for @person_1 will be deleted/),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Delete Permanently' }),
    );

    await waitFor(() => expect(api.deleteUser).toHaveBeenCalledWith('1'));
    await waitFor(() =>
      expect(screen.queryByTestId('user-detail')).not.toBeInTheDocument(),
    );
    expect(onToast).toHaveBeenCalledWith(
      'Account permanently deleted',
      'success',
    );
  });

  it('says which action failed and keeps the question open', async () => {
    api.getUsers.mockResolvedValue(list([user('1')]) as never);
    api.banUser.mockRejectedValue(new Error('no'));
    api.deleteUser.mockRejectedValue(new Error('no'));
    show();

    const row = await waitFor(() => rowOf('@person_1'));
    fireEvent.click(within(row).getByRole('button', { name: 'Ban' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Ban User' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to ban user', 'error'),
    );
    expect(within(dialog()).getByText('Ban this user?')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await choose('@person_1', 'Delete');
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Delete Permanently' }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to delete account', 'error'),
    );
  });

  it('opens the public profile on the platform, in another tab', async () => {
    api.getUsers.mockResolvedValue(
      list([user('1'), user('4', { profile: null })]) as never,
    );
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    show();

    await choose('@person_1', 'View profile');
    expect(open).toHaveBeenCalledWith(
      'https://platform.test/person_1',
      '_blank',
      'noopener,noreferrer',
    );

    await choose('@user', 'View profile');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('downloads the list as a file, and says so when it fails', async () => {
    const create = vi.fn(() => 'blob:users');
    const revoke = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: create,
      revokeObjectURL: revoke,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    api.exportUsersCSV.mockResolvedValue({
      data: 'id,email\n1,a@b.c',
    } as never);
    show();

    fireEvent.click(
      screen.getByRole('button', { name: 'Export users as CSV' }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('CSV downloaded', 'success'),
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:users');

    api.exportUsersCSV.mockRejectedValue(new Error('no'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Export users as CSV' }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to export CSV', 'error'),
    );
    vi.unstubAllGlobals();
  });
});
