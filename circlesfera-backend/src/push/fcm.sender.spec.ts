import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'native-push' })),
  cert: vi.fn((account) => account),
}));
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({ sendEachForMulticast: send })),
}));

import { initializeApp } from 'firebase-admin/app';
import { FcmSender } from './fcm.sender.js';

const config = (value?: string) => ({ get: vi.fn(() => value) }) as never;
const account = Buffer.from(
  JSON.stringify({ project_id: 'cs', client_email: 'x', private_key: 'k' }),
).toString('base64');

describe('FcmSender', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends nothing, and starts no Firebase, without a service account', async () => {
    const sender = new FcmSender(config(undefined));
    expect(await sender.send(['t1'], { title: 'a', body: 'b' })).toEqual([]);
    expect(initializeApp).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing with a service account it cannot read', async () => {
    const sender = new FcmSender(config('not base64 json'));
    expect(await sender.send(['t1'], { title: 'a', body: 'b' })).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends to every token and answers the ones that no longer reach a device', async () => {
    send.mockResolvedValue({
      responses: [
        { success: true },
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    });
    const sender = new FcmSender(config(account));

    const gone = await sender.send(['t1', 't2', 't3'], {
      title: 'Hi',
      body: 'New like',
      data: { url: '/p/1' },
    });

    expect(send).toHaveBeenCalledWith({
      tokens: ['t1', 't2', 't3'],
      notification: { title: 'Hi', body: 'New like' },
      data: { url: '/p/1' },
    });
    expect(gone).toEqual(['t2']);
    // Firebase starts once.
    await sender.send(['t1'], { title: 'a', body: 'b' });
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });

  it('sends nothing for no tokens', async () => {
    const sender = new FcmSender(config(account));
    expect(await sender.send([], { title: 'a', body: 'b' })).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});
