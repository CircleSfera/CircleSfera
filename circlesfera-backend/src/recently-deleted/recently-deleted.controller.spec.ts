import { describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { RecentlyDeletedController } from './recently-deleted.controller.js';
import type { RecentlyDeletedService } from './recently-deleted.service.js';

describe('RecentlyDeletedController', () => {
  const service = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    restorePost: vi.fn().mockResolvedValue({ id: 'p-1', kind: 'POST' }),
    restoreStory: vi.fn().mockResolvedValue({ id: 's-1', archived: true }),
    erasePost: vi.fn().mockResolvedValue(undefined),
    eraseStory: vi.fn().mockResolvedValue(undefined),
  };
  const controller = new RecentlyDeletedController(
    service as unknown as RecentlyDeletedService,
  );
  const user = { userId: 'u-1', profileId: 'me' } as CurrentUserData;

  it('acts for the Profile of the session only', async () => {
    await expect(controller.list(user)).resolves.toEqual({ items: [] });
    expect(service.list).toHaveBeenCalledWith('me');

    await expect(controller.restorePost(user, 'p-1')).resolves.toEqual({
      id: 'p-1',
      kind: 'POST',
    });
    expect(service.restorePost).toHaveBeenCalledWith('me', 'p-1');

    await expect(controller.restoreStory(user, 's-1')).resolves.toEqual({
      id: 's-1',
      archived: true,
    });
    expect(service.restoreStory).toHaveBeenCalledWith('me', 's-1');

    await expect(controller.erasePost(user, 'p-1')).resolves.toBeUndefined();
    expect(service.erasePost).toHaveBeenCalledWith('me', 'p-1');

    await expect(controller.eraseStory(user, 's-1')).resolves.toBeUndefined();
    expect(service.eraseStory).toHaveBeenCalledWith('me', 's-1');
  });
});
