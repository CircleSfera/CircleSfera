import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi } from '../services';
import { createTestQueryClient, renderWithProviders } from '../test/test-utils';
import FollowButton from './FollowButton';

vi.mock('../services', () => ({
  followsApi: { check: vi.fn(), toggle: vi.fn(), unblock: vi.fn() },
}));

const state = (status: string | undefined, following = false) =>
  ({ data: { status, following } }) as never;

async function show(first: ReturnType<typeof state>, fill = false) {
  vi.mocked(followsApi.check).mockResolvedValueOnce(first);
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const view = renderWithProviders(
    <FollowButton username="ana" fill={fill} />,
    { queryClient },
  );
  await waitFor(() => expect(followsApi.check).toHaveBeenCalledWith('ana'));
  return { invalidate, ...view };
}
/** The kinds of data read again after an action, in order. */
const refreshed = (invalidate: { mock: { calls: unknown[][] } }) =>
  invalidate.mock.calls.map(
    (call) => (call[0] as { queryKey: string[] }).queryKey[0],
  );

describe('FollowButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each([
    [state('ACCEPTED', true), 'Following'],
    [state('PENDING'), 'Requested'],
    [state('BLOCKED'), 'Unblock'],
    [state('NONE'), 'Follow'],
    [state(undefined, true), 'Following'],
    [state(undefined, false), 'Follow'],
  ])('reads %j as "%s"', async (first, label) => {
    await show(first);
    expect(
      await screen.findByRole('button', { name: label }),
    ).toBeInTheDocument();
  });

  it('follows at once on screen, then keeps what the server says', async () => {
    vi.mocked(followsApi.toggle).mockResolvedValue(state('ACCEPTED', true));
    vi.mocked(followsApi.check).mockResolvedValue(state('ACCEPTED', true));
    const { invalidate } = await show(state('NONE'));

    fireEvent.click(await screen.findByRole('button', { name: 'Follow' }));

    expect(
      await screen.findByRole('button', { name: 'Following' }),
    ).toBeInTheDocument();
    expect(followsApi.toggle).toHaveBeenCalledWith('ana');
    await waitFor(() =>
      expect(refreshed(invalidate)).toEqual(['follow', 'profile', 'followers']),
    );
  });

  it('shows the request as pending when the account is private', async () => {
    vi.mocked(followsApi.toggle).mockResolvedValue(state('PENDING'));
    vi.mocked(followsApi.check).mockResolvedValue(state('PENDING'));
    await show(state('NONE'));

    fireEvent.click(await screen.findByRole('button', { name: 'Follow' }));

    expect(
      await screen.findByRole('button', { name: 'Requested' }),
    ).toBeInTheDocument();
  });

  it('unfollows, and takes back a request that is waiting', async () => {
    vi.mocked(followsApi.toggle).mockResolvedValue(state('NONE'));
    vi.mocked(followsApi.check).mockResolvedValue(state('NONE'));
    const following = await show(state('ACCEPTED', true));
    fireEvent.click(await screen.findByRole('button', { name: 'Following' }));
    expect(
      await screen.findByRole('button', { name: 'Follow' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(refreshed(following.invalidate)).toContain('followers'),
    );
    following.unmount();

    await show(state('PENDING'));
    fireEvent.click(await screen.findByRole('button', { name: 'Requested' }));
    expect(
      await screen.findByRole('button', { name: 'Follow' }),
    ).toBeInTheDocument();
  });

  it('goes back to what it showed when the server refuses', async () => {
    vi.mocked(followsApi.toggle).mockRejectedValue(new Error('down'));
    vi.mocked(followsApi.check).mockResolvedValue(state('NONE'));
    const { invalidate } = await show(state('NONE'));

    fireEvent.click(await screen.findByRole('button', { name: 'Follow' }));

    await waitFor(() => expect(followsApi.toggle).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: 'Follow' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(refreshed(invalidate)).toEqual(['follow']));
  });

  it('unblocks an account the person had blocked, instead of trying to follow it', async () => {
    vi.mocked(followsApi.unblock).mockResolvedValue({} as never);
    vi.mocked(followsApi.check).mockResolvedValue(state('NONE'));
    const { invalidate } = await show(state('BLOCKED'));

    fireEvent.click(await screen.findByRole('button', { name: 'Unblock' }));

    expect(
      await screen.findByRole('button', { name: 'Follow' }),
    ).toBeInTheDocument();
    expect(followsApi.unblock).toHaveBeenCalledWith('ana');
    expect(followsApi.toggle).not.toHaveBeenCalled();
    await waitFor(() => expect(refreshed(invalidate)).toContain('profile'));
  });

  it('fills the width it is given when asked to', async () => {
    const wide = await show(state('NONE'), true);
    expect(
      (await screen.findByRole('button', { name: 'Follow' })).className,
    ).toContain('w-full');
    wide.unmount();

    await show(state('NONE'));
    expect(
      (await screen.findByRole('button', { name: 'Follow' })).className,
    ).not.toContain('w-full');
  });
});
