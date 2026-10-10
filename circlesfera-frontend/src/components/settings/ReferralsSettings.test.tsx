import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import ReferralsSettings from './ReferralsSettings';

vi.mock('../../services', () => ({
  profileApi: { getMyReferrals: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const api = vi.mocked(profileApi);
const writeText = vi.fn();
const invites = (over: object = {}) => ({
  inviteCode: 'ANA123',
  referrals: [],
  maxReferrals: 3,
  referralCount: 1,
  ...over,
});
const show = async (data: object = invites()) => {
  api.getMyReferrals.mockResolvedValue({ data } as never);
  const view = renderWithProviders(<ReferralsSettings />);
  await screen.findByText('Your invite link');
  return view;
};
const link = () => screen.getByLabelText('Your invite link');
const copy = () => screen.getByRole('button', { name: 'Copy' });

describe('ReferralsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeText.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  });

  it('waits for the invitations before showing anything', () => {
    api.getMyReferrals.mockReturnValue(new Promise(() => {}) as never);

    renderWithProviders(<ReferralsSettings />);

    expect(screen.queryByText('Your invite link')).not.toBeInTheDocument();
  });

  it('shows the link with the own code and how many invitations are used', async () => {
    await show();

    expect(link()).toHaveValue(
      `${window.location.origin}/accounts/signup?inviteCode=ANA123`,
    );
    expect(screen.getByText('1 / 3 used')).toBeInTheDocument();
    expect(
      screen.getByText('You have not invited anyone yet.'),
    ).toBeInTheDocument();
  });

  it('copies the link and says so', async () => {
    await show();

    fireEvent.click(copy());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Invite link copied'),
    );
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/accounts/signup?inviteCode=ANA123`,
    );
  });

  it('says the link was not copied when the device refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    await show();

    fireEvent.click(copy());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The link could not be copied. Select it and copy it by hand.',
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('stops copying once every invitation is used, and says why', async () => {
    await show(invites({ referralCount: 3 }));

    expect(copy()).toBeDisabled();
    expect(
      screen.getByText('You have used all invites for this beta.'),
    ).toBeInTheDocument();
  });

  it('shows no link without a code, instead of one that invites with none', async () => {
    await show(invites({ inviteCode: undefined }));

    expect(link()).toHaveValue('');
    expect(copy()).toBeDisabled();
  });

  it('counts with three invitations and none used when the answer does not say', async () => {
    await show({ inviteCode: 'ANA123' });

    expect(screen.getByText('0 / 3 used')).toBeInTheDocument();
  });

  it('lists who joined, by name or by username, with the date', async () => {
    await show(
      invites({
        referrals: [
          {
            id: 'r-1',
            createdAt: '2026-03-01T10:00:00Z',
            profile: { username: 'leo', fullName: 'Leo Paz' },
          },
          {
            id: 'r-2',
            createdAt: '2026-03-02T10:00:00Z',
            profile: { username: 'mar' },
          },
          { id: 'r-3', createdAt: '2026-03-03T10:00:00Z' },
        ],
      }),
    );

    expect(screen.getByText('Leo Paz')).toBeInTheDocument();
    expect(screen.getByText(/@leo\s+Joined/)).toBeInTheDocument();
    expect(screen.getByText('mar')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(
      screen.queryByText('You have not invited anyone yet.'),
    ).not.toBeInTheDocument();
  });
});
