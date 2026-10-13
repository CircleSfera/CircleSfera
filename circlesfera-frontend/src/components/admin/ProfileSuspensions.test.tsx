import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AdminProfileStanding,
  adminApi,
} from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { renderWithProviders } from '../../test/test-utils';
import ProfileSuspensions from './ProfileSuspensions';

vi.mock('../../services/admin.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/admin.service')>()),
  adminApi: { suspendProfile: vi.fn(), liftProfileSuspension: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const api = vi.mocked(adminApi);

const profile = (
  over: Partial<AdminProfileStanding>,
): AdminProfileStanding => ({
  id: 'p-1',
  username: 'ana',
  fullName: 'Ana Ruiz',
  isAccountBanned: false,
  suspendedUntil: null,
  suspensionCause: null,
  ...over,
});
const show = (profiles: AdminProfileStanding[]) =>
  renderWithProviders(
    <ProfileSuspensions userId="user-1" profiles={profiles} />,
  );
const rowOf = (username: string) =>
  screen.getByText(`@${username}`).closest('li') as HTMLElement;

describe('ProfileSuspensions', () => {
  beforeEach(() => {
    useAdminAuthStore.setState({ hasPermission: () => true } as never);
    vi.clearAllMocks();
    api.suspendProfile.mockResolvedValue({} as never);
    api.liftProfileSuspension.mockResolvedValue({} as never);
  });

  it('shows the standing of each Profile on its own', () => {
    show([
      profile({}),
      profile({
        id: 'p-2',
        username: 'ana.shop',
        suspendedUntil: '2026-11-03T10:00:00Z',
        suspensionCause: 'SCAM',
      }),
      profile({ id: 'p-3', username: 'ana.old', isAccountBanned: true }),
    ]);

    expect(within(rowOf('ana')).getByText('Active')).toBeInTheDocument();
    expect(
      within(rowOf('ana.shop')).getByText(
        /^Suspended until .* · Scam or fraud$/,
      ),
    ).toBeInTheDocument();
    expect(within(rowOf('ana.old')).getByText('Banned')).toBeInTheDocument();
    // A banned Profile has nothing to suspend or lift.
    expect(within(rowOf('ana.old')).queryByRole('button')).toBeNull();
  });

  it('suspends one Profile only once a cause, the days and what was seen are given', async () => {
    show([profile({}), profile({ id: 'p-2', username: 'ana.shop' })]);

    fireEvent.click(
      within(rowOf('ana.shop')).getByRole('button', {
        name: 'Suspend this profile',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', {
      name: 'Suspend this profile',
    });
    expect(
      within(dialog).getByText(
        "Only @ana.shop is suspended. The person's other profiles keep working.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(confirm);
    expect(api.suspendProfile).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Serious cause'), {
      target: { value: 'HARASSMENT' },
    });
    fireEvent.change(within(dialog).getByLabelText('Days (1 to 30)'), {
      target: { value: '14' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^What you saw/), {
      target: { value: '  Published the address of another person.  ' },
    });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(api.suspendProfile).toHaveBeenCalledWith('p-2', {
        cause: 'HARASSMENT',
        days: 14,
        note: 'Published the address of another person.',
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Profile suspended'),
    );
  });

  it.each([
    ['more than thirty days', '31', 'Enough words about what was seen.'],
    ['a note of a few letters', '7', 'bad'],
  ])('does not send a suspension with %s', async (_what, days, note) => {
    show([profile({})]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Suspend this profile' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Serious cause'), {
      target: { value: 'SCAM' },
    });
    fireEvent.change(within(dialog).getByLabelText('Days (1 to 30)'), {
      target: { value: days },
    });
    fireEvent.change(within(dialog).getByLabelText(/^What you saw/), {
      target: { value: note },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Suspend this profile' }),
    );

    expect(api.suspendProfile).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(
        'Choose a cause, a number of days and write at least 10 characters.',
      ),
    ).toBeInTheDocument();
  });

  it('says what each special cause means before it is applied', async () => {
    show([profile({})]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Suspend this profile' }),
    );
    const dialog = await screen.findByRole('dialog');
    const cause = within(dialog).getByLabelText('Serious cause');

    fireEvent.change(cause, { target: { value: 'CHILD_EXPLOITATION' } });
    expect(
      within(dialog).getByText(
        /the outcome is a ban, and the evidence is kept/,
      ),
    ).toBeInTheDocument();

    fireEvent.change(cause, { target: { value: 'COMPROMISED' } });
    expect(
      within(dialog).getByText(/is not a sanction: it has no appeal/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/the outcome is a ban/)).toBeNull();
  });

  it('lifts the suspension of one Profile after asking', async () => {
    show([
      profile({
        suspendedUntil: '2026-11-03T10:00:00Z',
        suspensionCause: 'COMPROMISED',
      }),
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Lift the suspension' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Lift the suspension' }),
    );

    await waitFor(() =>
      expect(api.liftProfileSuspension).toHaveBeenCalledWith('p-1'),
    );
  });

  it('offers nothing to a staff member who may not sanction, and says so when the server refuses', async () => {
    useAdminAuthStore.setState({ hasPermission: () => false } as never);
    const { unmount } = show([profile({})]);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    useAdminAuthStore.setState({ hasPermission: () => true } as never);
    api.suspendProfile.mockRejectedValue(new Error('no'));
    show([profile({})]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Suspend this profile' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Serious cause'), {
      target: { value: 'SCAM' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^What you saw/), {
      target: { value: 'Fake giveaway asking for card numbers.' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Suspend this profile' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The profile could not be suspended',
      ),
    );
  });
});
