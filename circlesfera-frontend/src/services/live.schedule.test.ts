import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveApi } from './live';

const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('./api', () => ({ apiClient: client }));

describe('liveApi scheduled lives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.post.mockResolvedValue({ data: 'posted' });
    client.delete.mockResolvedValue({ data: 'deleted' });
  });

  it("asks for a Profile's upcoming lives, and takes anything but a list as none", async () => {
    client.get.mockResolvedValueOnce({ data: [{ id: 'sl-1' }] });
    expect(await liveApi.listScheduled('p1')).toEqual([{ id: 'sl-1' }]);
    expect(client.get).toHaveBeenLastCalledWith('/live/scheduled', {
      params: { profileId: 'p1' },
    });

    client.get.mockResolvedValueOnce({ data: {} });
    expect(await liveApi.listScheduled('p1')).toEqual([]);
  });

  it('schedules, cancels and sets or takes back a reminder at their addresses', async () => {
    const body = {
      title: 'Sunday chat',
      audience: 'EVERYONE' as const,
      startsAt: '2026-11-09T18:30:00.000Z',
    };
    expect(await liveApi.schedule(body)).toBe('posted');
    expect(client.post).toHaveBeenLastCalledWith('/live/scheduled', body);

    expect(await liveApi.cancelScheduled('sl-1')).toBe('deleted');
    expect(client.delete).toHaveBeenLastCalledWith('/live/scheduled/sl-1');

    await liveApi.remind('sl-1');
    expect(client.post).toHaveBeenLastCalledWith(
      '/live/scheduled/sl-1/reminder',
    );

    await liveApi.unremind('sl-1');
    expect(client.delete).toHaveBeenLastCalledWith(
      '/live/scheduled/sl-1/reminder',
    );
  });
});
