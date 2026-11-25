import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./api', () => ({ apiClient: client }));

import {
  foundingCreatorsApi as api,
  foundingCreatorsStaffApi as staff,
} from './foundingCreators.service';

describe('foundingCreatorsApi', () => {
  beforeEach(() => {
    for (const fn of Object.values(client)) {
      fn.mockReset().mockResolvedValue({ data: { ok: 1 } });
    }
  });

  it('calls each route of the Profile in use and answers its data', async () => {
    const request = { links: ['https://vimeo.com/ana'], city: 'Valencia' };
    await expect(api.status()).resolves.toEqual({ ok: 1 });
    await expect(api.apply(request)).resolves.toEqual({ ok: 1 });
    await expect(api.startFreeYear()).resolves.toEqual({ ok: 1 });

    expect(client.get).toHaveBeenCalledWith('/founding-creators');
    expect(client.post.mock.calls).toEqual([
      ['/founding-creators', request],
      ['/founding-creators/free-year'],
    ]);
  });

  it('reads the staff queue and sends a decision', async () => {
    await expect(staff.queue()).resolves.toEqual({ ok: 1 });
    await staff.decide('a1', { approve: false, reason: 'PROGRAM_FULL' });

    expect(client.get).toHaveBeenCalledWith('admin/founding-creators');
    expect(client.post).toHaveBeenCalledWith(
      'admin/founding-creators/a1/decision',
      { approve: false, reason: 'PROGRAM_FULL' },
    );
  });
});
