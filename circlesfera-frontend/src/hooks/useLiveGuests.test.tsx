import { LIVE_GUESTS_MAX } from '@circlesfera/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveGuests } from './useLiveGuests';

const api = vi.hoisted(() => ({
  inviteGuest: vi.fn(),
  removeGuest: vi.fn(),
  getStream: vi.fn(),
  getProfile: vi.fn(),
  handlers: new Map<string, (data: unknown) => void>(),
}));

vi.mock('../services/live', () => ({
  liveApi: {
    inviteGuest: api.inviteGuest,
    removeGuest: api.removeGuest,
    getStream: api.getStream,
  },
}));
vi.mock('../services/profile.service', () => ({
  profileApi: { getProfile: api.getProfile },
}));
vi.mock('../stores/socketStore', () => ({
  useSocketStore: {
    getState: () => ({
      socket: {
        on: (event: string, fn: (data: unknown) => void) =>
          api.handlers.set(event, fn),
        off: (event: string) => api.handlers.delete(event),
      },
    }),
  },
}));

const profileOf = (username: string) => ({
  data: { id: `p-${username}`, username, avatar: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  api.handlers.clear();
  api.getProfile.mockImplementation((username: string) =>
    username === 'ghost'
      ? Promise.reject(new Error('404'))
      : Promise.resolve(profileOf(username)),
  );
  api.inviteGuest.mockResolvedValue({});
  api.removeGuest.mockResolvedValue({});
  api.getStream.mockResolvedValue({ guests: [] });
});

describe('useLiveGuests', () => {
  it('keeps the people chosen before the live, and invites them when it starts', async () => {
    const { result, rerender } = renderHook(
      ({ streamId }) => useLiveGuests(streamId),
      { initialProps: { streamId: null as string | null } },
    );

    await act(async () => {
      expect(await result.current.invite('@ana')).toBeNull();
    });
    expect(result.current.queued.map((g) => g.username)).toEqual(['ana']);
    expect(api.inviteGuest).not.toHaveBeenCalled();

    api.getStream.mockResolvedValue({
      guests: [{ profileId: 'p-ana', username: 'ana', status: 'INVITED' }],
    });
    rerender({ streamId: 'live-1' });

    await waitFor(() =>
      expect(result.current.guests.map((g) => g.username)).toEqual(['ana']),
    );
    expect(api.inviteGuest).toHaveBeenCalledWith('live-1', 'p-ana');
    expect(result.current.queued).toEqual([]);
  });

  it('says why an invite did not go: unknown, already invited, or full', async () => {
    const { result } = renderHook(() => useLiveGuests(null));

    await act(async () => {
      expect(await result.current.invite('ghost')).toBe('not_found');
      expect(await result.current.invite('   ')).toBe('not_found');
    });
    await act(async () => {
      await result.current.invite('ana');
    });
    await act(async () => {
      expect(await result.current.invite('ana')).toBe('already');
    });
    for (let i = 1; i < LIVE_GUESTS_MAX; i++) {
      await act(async () => {
        await result.current.invite(`guest${i}`);
      });
    }
    expect(result.current.full).toBe(true);
    await act(async () => {
      expect(await result.current.invite('one-more')).toBe('full');
    });
  });

  it('invites on air, follows the room, and takes a guest off', async () => {
    const { result } = renderHook(() => useLiveGuests('live-1'));
    await waitFor(() =>
      expect(api.handlers.has('live:guest_invites')).toBe(true),
    );

    await act(async () => {
      expect(await result.current.invite('luis')).toBeNull();
    });
    expect(result.current.guests).toEqual([
      {
        profileId: 'p-luis',
        username: 'luis',
        avatar: null,
        status: 'INVITED',
      },
    ]);

    act(() =>
      api.handlers.get('live:guest_invites')?.({
        guests: [{ profileId: 'p-luis', username: 'luis', status: 'ON_AIR' }],
      }),
    );
    expect(result.current.guests[0].status).toBe('ON_AIR');

    await act(async () => {
      expect(await result.current.remove('p-luis')).toBe(true);
    });
    expect(api.removeGuest).toHaveBeenCalledWith('live-1', 'p-luis');
    expect(result.current.guests).toEqual([]);
  });

  it('keeps what the server told the host over an older answer asked for before', async () => {
    let answer: (value: unknown) => void = () => {};
    api.getStream.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { result } = renderHook(() => useLiveGuests('live-1'));
    await waitFor(() =>
      expect(api.handlers.has('live:guest_invites')).toBe(true),
    );
    await waitFor(() => expect(api.getStream).toHaveBeenCalled());

    act(() =>
      api.handlers.get('live:guest_invites')?.({
        guests: [{ profileId: 'p-luis', username: 'luis', status: 'ON_AIR' }],
      }),
    );
    await act(async () => answer({ guests: [] }));

    expect(result.current.guests.map((g) => g.username)).toEqual(['luis']);
  });

  it('answers when the server would not invite or take off', async () => {
    api.inviteGuest.mockRejectedValue(new Error('403'));
    api.removeGuest.mockRejectedValue(new Error('403'));
    const { result } = renderHook(() => useLiveGuests('live-1'));

    await act(async () => {
      expect(await result.current.invite('luis')).toBe('failed');
      expect(await result.current.remove('p-luis')).toBe(false);
    });
  });

  it('takes someone off the list before the live without asking the server', async () => {
    const { result } = renderHook(() => useLiveGuests(null));
    await act(async () => {
      await result.current.invite('ana');
    });
    await act(async () => {
      expect(await result.current.remove('p-ana')).toBe(true);
    });
    expect(result.current.queued).toEqual([]);
    expect(api.removeGuest).not.toHaveBeenCalled();
  });
});
