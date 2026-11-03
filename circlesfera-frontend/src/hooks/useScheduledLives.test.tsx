import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledLive } from '../services/live';
import { createTestQueryClient } from '../test/test-utils';
import {
  scheduledLivesKey,
  useCancelScheduledLive,
  useLiveReminder,
  useScheduledLives,
  useScheduleLive,
} from './useScheduledLives';

const api = vi.hoisted(() => ({
  listScheduled: vi.fn(),
  schedule: vi.fn(),
  cancelScheduled: vi.fn(),
  remind: vi.fn(),
  unremind: vi.fn(),
}));
vi.mock('../services/live', () => ({ liveApi: api }));

const live = (over: Partial<ScheduledLive> = {}): ScheduledLive => ({
  id: 'sl-1',
  hostId: 'host-1',
  title: 'Sunday chat',
  audience: 'EVERYONE',
  startsAt: '2026-11-09T18:30:00.000Z',
  status: 'SCHEDULED',
  reminded: false,
  ...over,
});

function setup() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useScheduledLives', () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists a Profile's upcoming lives", async () => {
    api.listScheduled.mockResolvedValue([live()]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useScheduledLives('host-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual([live()]));
    expect(api.listScheduled).toHaveBeenCalledWith('host-1');
  });

  it('asks for nothing without a Profile', () => {
    const { wrapper } = setup();
    renderHook(() => useScheduledLives(null), { wrapper });
    expect(api.listScheduled).not.toHaveBeenCalled();
  });

  it("refreshes the host's list once a live is scheduled", async () => {
    api.schedule.mockResolvedValue(live());
    const { wrapper, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useScheduleLive(), { wrapper });
    const body = {
      title: 'Sunday chat',
      audience: 'EVERYONE' as const,
      startsAt: '2026-11-09T18:30:00.000Z',
    };
    await act(() => result.current.mutateAsync(body));
    expect(api.schedule).toHaveBeenCalledWith(body);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: scheduledLivesKey('host-1'),
    });
  });

  it("refreshes the host's list once a live is cancelled", async () => {
    api.cancelScheduled.mockResolvedValue({ success: true });
    const { wrapper, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCancelScheduledLive(), { wrapper });
    await act(() => result.current.mutateAsync(live()));
    expect(api.cancelScheduled).toHaveBeenCalledWith('sl-1');
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: scheduledLivesKey('host-1'),
    });
  });
});

describe('useLiveReminder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets a reminder, and takes it back', async () => {
    api.remind.mockResolvedValue({ reminded: true });
    api.unremind.mockResolvedValue({ reminded: false });
    const { wrapper, queryClient } = setup();
    queryClient.setQueryData(scheduledLivesKey('host-1'), [live()]);
    const { result } = renderHook(() => useLiveReminder(), { wrapper });
    const cached = () =>
      queryClient.getQueryData<ScheduledLive[]>(scheduledLivesKey('host-1'));

    await act(() => result.current.mutateAsync(live()));
    expect(api.remind).toHaveBeenCalledWith('sl-1');
    expect(cached()?.[0].reminded).toBe(true);

    await act(() => result.current.mutateAsync(live({ reminded: true })));
    expect(api.unremind).toHaveBeenCalledWith('sl-1');
    expect(cached()?.[0].reminded).toBe(false);
  });

  it('shows the reminder at once and goes back when it is refused', async () => {
    let refuse: (error: unknown) => void = () => {};
    api.remind.mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject;
      }),
    );
    api.listScheduled.mockResolvedValue([live()]);
    const { wrapper, queryClient } = setup();
    queryClient.setQueryData(scheduledLivesKey('host-1'), [live()]);
    const { result } = renderHook(() => useLiveReminder(), { wrapper });
    const cached = () =>
      queryClient.getQueryData<ScheduledLive[]>(scheduledLivesKey('host-1'));

    act(() => result.current.mutate(live()));
    await waitFor(() => expect(cached()?.[0].reminded).toBe(true));
    await act(async () => refuse(new Error('refused')));
    await waitFor(() => expect(cached()?.[0].reminded).toBe(false));
  });
});
