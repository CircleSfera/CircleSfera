import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import UserVerificationTab from './UserVerificationTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getUsers: vi.fn(),
    getKycStats: vi.fn(),
    updateUserStatus: vi.fn(),
    revokeUserKYC: vi.fn(),
    syncUserKYC: vi.fn(),
  },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

const api = vi.mocked(adminApi);
const onToast = vi.fn();
const NOW = new Date('2026-03-10T12:00:00Z');
const ago = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString();

const user = (id: string, over: object = {}) => ({
  id,
  email: `${id}@example.com`,
  createdAt: ago(5),
  verificationLevel: 'BASIC',
  accountType: 'PERSONAL',
  identityVerifiedAt: null,
  stripeIdentitySessionId: null,
  profile: { username: `person_${id}`, avatar: null },
  ...over,
});
const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit: 20,
      totalPages,
    },
  },
});
const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });
const show = () =>
  renderWithProviders(<UserVerificationTab onToast={onToast} />);
const card = (label: string) =>
  screen
    .getAllByText(label, { selector: 'p' })
    .map((el) => el.closest('.glass-panel'))
    .find(Boolean) as HTMLElement;

describe('UserVerificationTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    api.getUsers.mockResolvedValue(list([]) as never);
    api.getKycStats.mockResolvedValue({
      data: { verified: 40, pending: 7, notStarted: 300 },
    } as never);
    api.updateUserStatus.mockResolvedValue({} as never);
    api.revokeUserKYC.mockResolvedValue({} as never);
    api.syncUserKYC.mockResolvedValue({
      data: { status: 'verified' },
    } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows how many people are verified, in progress and not started', async () => {
    show();

    expect(await screen.findByText('No users found')).toBeInTheDocument();
    expect(api.getUsers).toHaveBeenCalledWith(
      1,
      20,
      '',
      undefined,
      undefined,
      undefined,
    );
    await waitFor(
      () => {
        expect(card('Identity verified')).toHaveTextContent('40');
        expect(card('Verification pending')).toHaveTextContent('7');
        expect(card('Not started')).toHaveTextContent('300');
      },
      { timeout: 4000 },
    );
  });

  it('shows zeros while the totals are unknown', async () => {
    api.getKycStats.mockReturnValue(new Promise(() => {}));
    show();

    await screen.findByText('No users found');
    expect(card('Verification pending')).toHaveTextContent('0');
  });

  it('asks again from the first page on a search or a status', async () => {
    api.getUsers.mockImplementation((pageNumber = 1) =>
      Promise.resolve(list([user(`p${pageNumber}`)], pageNumber, 3) as never),
    );
    show();
    await screen.findByText('@person_p1');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('@person_p2');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search users...' }), {
      target: { value: 'ana' },
    });
    await waitFor(() =>
      expect(api.getUsers).toHaveBeenLastCalledWith(
        1,
        20,
        'ana',
        undefined,
        undefined,
        undefined,
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(api.getUsers).toHaveBeenLastCalledWith(
        2,
        20,
        'ana',
        undefined,
        undefined,
        undefined,
      ),
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Verification status' }),
      {
        target: { value: 'pending' },
      },
    );
    await waitFor(() =>
      expect(api.getUsers).toHaveBeenLastCalledWith(
        1,
        20,
        'ana',
        undefined,
        undefined,
        'pending',
      ),
    );
  });

  it('shows where each person stands and since when they are here', async () => {
    api.getUsers.mockResolvedValue(
      list([
        user('new', { createdAt: ago(0) }),
        user('done', {
          identityVerifiedAt: ago(60),
          stripeIdentitySessionId: 'vs_1',
          createdAt: ago(45),
          accountType: 'CREATOR',
        }),
        user('wait', {
          stripeIdentitySessionId: 'vs_2',
          createdAt: ago(5 * 60),
        }),
        user('old', { createdAt: ago(3 * 24 * 60), profile: null }),
      ]) as never,
    );
    show();

    await screen.findByText('@person_new');
    const fresh = rowOf('@person_new');
    expect(within(fresh).getByText('Not verified')).toHaveClass(
      'text-white/50',
    );
    expect(within(fresh).getByText('now')).toBeInTheDocument();
    expect(within(fresh).getByText('Personal account')).toBeInTheDocument();

    const done = rowOf('@person_done');
    expect(within(done).getByText('Identity verified')).toHaveClass(
      'text-green-400',
    );
    expect(within(done).getByText('45m ago')).toBeInTheDocument();
    expect(within(done).getByText('Creator account')).toBeInTheDocument();

    const waiting = rowOf('@person_wait');
    expect(within(waiting).getByText('Verification in progress')).toHaveClass(
      'text-yellow-400',
    );
    expect(within(waiting).getByText('5h ago')).toBeInTheDocument();

    expect(within(rowOf('@Unknown')).getByText('3d ago')).toBeInTheDocument();
  });

  it('opens someone who has not started: nothing to sync or revoke', async () => {
    api.getUsers.mockResolvedValue(list([user('a')]) as never);
    show();
    await screen.findByText('@person_a');

    fireEvent.click(rowOf('@person_a'));

    const open = detail();
    expect(within(open).getByText('ID: a')).toBeInTheDocument();
    expect(within(open).getByText('Not started')).toBeInTheDocument();
    expect(within(open).getByText('N/A')).toBeInTheDocument();
    expect(
      within(open).queryByRole('button', { name: 'Sync from Stripe' }),
    ).not.toBeInTheDocument();
    expect(
      within(open).queryByRole('button', {
        name: 'Revoke the verification and ask for it again',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(open).queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument();
  });

  it('syncs someone in progress with the provider and says how it ended', async () => {
    api.getUsers.mockResolvedValue(
      list([user('a', { stripeIdentitySessionId: 'vs_9' })]) as never,
    );
    show();
    await screen.findByText('@person_a');
    fireEvent.click(rowOf('@person_a'));

    const open = detail();
    expect(
      within(open).getByText('Session created (pending)'),
    ).toBeInTheDocument();
    expect(within(open).getByText('vs_9')).toBeInTheDocument();
    fireEvent.click(
      within(open).getByRole('button', { name: 'Sync from Stripe' }),
    );

    await waitFor(() => expect(api.syncUserKYC).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Synced: identity verified',
        'success',
      ),
    );
    expect(api.getUsers).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ data: { status: 'already_verified' } }, 'Synced: identity verified'],
    [{ data: { status: 'processing' } }, 'Synced: processing'],
    [{ data: {} }, 'Synced: ok'],
  ])('reports a sync that answers %j', async (answer, message) => {
    api.syncUserKYC.mockResolvedValue(answer as never);
    api.getUsers.mockResolvedValue(
      list([user('a', { stripeIdentitySessionId: 'vs_9' })]) as never,
    );
    show();
    await screen.findByText('@person_a');
    fireEvent.click(rowOf('@person_a'));

    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Sync from Stripe' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(message, 'success'),
    );
  });

  it('says so when the sync fails', async () => {
    api.syncUserKYC.mockRejectedValue(new Error('no'));
    api.getUsers.mockResolvedValue(
      list([user('a', { stripeIdentitySessionId: 'vs_9' })]) as never,
    );
    show();
    await screen.findByText('@person_a');
    fireEvent.click(rowOf('@person_a'));

    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Sync from Stripe' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Could not sync with Stripe',
        'error',
      ),
    );
  });

  it('revokes a verified identity only after confirming', async () => {
    api.getUsers.mockResolvedValue(
      list([
        user('a', {
          identityVerifiedAt: ago(60),
          stripeIdentitySessionId: 'vs_1',
        }),
      ]) as never,
    );
    show();
    await screen.findByText('@person_a');
    fireEvent.click(rowOf('@person_a'));

    const open = detail();
    expect(within(open).getByText('Identity verified')).toBeInTheDocument();
    expect(
      within(open).getByText(/Stripe confirmed this user's identity on /),
    ).toBeInTheDocument();
    // Verified already: there is nothing left to sync.
    expect(
      within(open).queryByRole('button', { name: 'Sync from Stripe' }),
    ).not.toBeInTheDocument();

    const revoke = () =>
      fireEvent.click(
        within(detail()).getByRole('button', {
          name: 'Revoke the verification and ask for it again',
        }),
      );
    revoke();
    let dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Revoke the identity verification?'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.revokeUserKYC).not.toHaveBeenCalled();

    revoke();
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(api.revokeUserKYC).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Identity verification revoked',
        'success',
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says so when the verification cannot be revoked', async () => {
    api.revokeUserKYC.mockRejectedValue(new Error('no'));
    api.getUsers.mockResolvedValue(
      list([user('a', { stripeIdentitySessionId: 'vs_1' })]) as never,
    );
    show();
    await screen.findByText('@person_a');
    fireEvent.click(rowOf('@person_a'));

    fireEvent.click(
      within(detail()).getByRole('button', {
        name: 'Revoke the verification and ask for it again',
      }),
    );
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Revoke',
      }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'The verification could not be revoked',
        'error',
      ),
    );
  });

  it('offers to save only once the level or the account type differs, and sends both', async () => {
    api.getUsers.mockResolvedValue(list([user('a')]) as never);
    show();
    await screen.findByText('@person_a');
    fireEvent.click(rowOf('@person_a'));

    const level = within(detail()).getByRole('combobox', {
      name: 'Profile verification level',
    });
    const type = within(detail()).getByRole('combobox', {
      name: 'Account type',
    });
    expect(level).toHaveValue('BASIC');
    expect(type).toHaveValue('PERSONAL');

    fireEvent.change(level, { target: { value: 'VERIFIED' } });
    expect(
      within(detail()).getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument();
    fireEvent.change(level, { target: { value: 'BASIC' } });
    expect(
      within(detail()).queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument();

    fireEvent.change(level, { target: { value: 'ELITE' } });
    fireEvent.change(type, { target: { value: 'CREATOR' } });
    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() =>
      expect(api.updateUserStatus).toHaveBeenCalledWith('a', {
        verificationLevel: 'ELITE',
        accountType: 'CREATOR',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Profile updated successfully',
        'success',
      ),
    );
  });

  it('says so when the level cannot be saved', async () => {
    api.updateUserStatus.mockRejectedValue(new Error('no'));
    api.getUsers.mockResolvedValue(list([user('a')]) as never);
    show();
    await screen.findByText('@person_a');
    fireEvent.click(rowOf('@person_a'));
    fireEvent.change(
      within(detail()).getByRole('combobox', { name: 'Account type' }),
      { target: { value: 'BUSINESS' } },
    );

    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to update profile', 'error'),
    );
  });

  it('starts from each person’s own level when another one is opened', async () => {
    api.getUsers.mockResolvedValue(
      list([
        user('a'),
        user('b', { verificationLevel: 'BUSINESS', accountType: 'BUSINESS' }),
        user('c', { verificationLevel: null, accountType: null }),
      ]) as never,
    );
    show();
    await screen.findByText('@person_a');

    fireEvent.click(rowOf('@person_a'));
    fireEvent.change(
      within(detail()).getByRole('combobox', {
        name: 'Profile verification level',
      }),
      { target: { value: 'ELITE' } },
    );

    fireEvent.click(rowOf('@person_b'));
    await waitFor(() =>
      expect(within(detail()).getByText('ID: b')).toBeInTheDocument(),
    );
    expect(
      within(detail()).getByRole('combobox', {
        name: 'Profile verification level',
      }),
    ).toHaveValue('BUSINESS');
    expect(
      within(detail()).getByRole('combobox', { name: 'Account type' }),
    ).toHaveValue('BUSINESS');
    expect(
      within(detail()).queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument();

    fireEvent.click(rowOf('@person_c'));
    await waitFor(() =>
      expect(within(detail()).getByText('ID: c')).toBeInTheDocument(),
    );
    expect(
      within(detail()).getByRole('combobox', {
        name: 'Profile verification level',
      }),
    ).toHaveValue('BASIC');
  });

  it('closes the open person with Escape', async () => {
    api.getUsers.mockResolvedValue(list([user('a')]) as never);
    show();
    await screen.findByText('@person_a');
    fireEvent.click(rowOf('@person_a'));
    expect(screen.getByText('ID: a')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByText('ID: a')).not.toBeInTheDocument(),
    );
  });

  it('goes back to the list from the open person', async () => {
    api.getUsers.mockResolvedValue(list([user('a')]) as never);
    show();
    await screen.findByText('@person_a');
    fireEvent.click(rowOf('@person_a'));

    fireEvent.click(within(detail()).getByRole('button', { name: 'Back' }));

    await waitFor(() =>
      expect(screen.queryByText('ID: a')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('@person_a')).toBeInTheDocument();
  });
});
