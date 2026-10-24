import { generateKeyPairSync, verify } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Apple's answer per device token: status and optional reason.
let answers: Record<string, { status: number; reason?: string }> = {};
const requests: { headers: Record<string, string>; body: string }[] = [];
const connect = vi.fn();

function fakeSession() {
  const session = Object.assign(new EventEmitter(), {
    closed: false,
    destroyed: false,
    close: vi.fn(),
    destroy: vi.fn(),
    request: vi.fn((headers: Record<string, string>) => {
      const stream = Object.assign(new EventEmitter(), {
        setEncoding: vi.fn(),
        setTimeout: vi.fn(),
        close: vi.fn(),
        end: (body: string) => {
          requests.push({ headers, body });
          const token = headers[':path'].split('/').pop() as string;
          const answer = answers[token] ?? { status: 200 };
          queueMicrotask(() => {
            stream.emit('response', { ':status': answer.status });
            if (answer.reason) {
              stream.emit('data', JSON.stringify({ reason: answer.reason }));
            }
            stream.emit('end');
          });
        },
      });
      return stream;
    }),
  });
  return session;
}

vi.mock('node:http2', () => ({
  default: {
    connect: (...args: unknown[]) => connect(...args),
    constants: { NGHTTP2_CANCEL: 8 },
  },
}));

import { ApnsSender } from './apns.sender.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});
const P8 = Buffer.from(
  privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
).toString('base64');

const config = (values: Record<string, string | undefined>) =>
  ({ get: vi.fn((key: string) => values[key]) }) as never;
const APPLE = { APNS_KEY: P8, APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM45' };

describe('ApnsSender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answers = {};
    requests.length = 0;
    connect.mockImplementation(() => fakeSession());
  });

  it.each([
    ['no key', { ...APPLE, APNS_KEY: undefined }],
    ['no key id', { ...APPLE, APNS_KEY_ID: undefined }],
    ['no team id', { ...APPLE, APNS_TEAM_ID: undefined }],
    ['a key it cannot read', { ...APPLE, APNS_KEY: 'bm90IGEga2V5' }],
  ])(
    'sends nothing, and opens no connection, with %s',
    async (_what, values) => {
      const sender = new ApnsSender(config(values));
      expect(await sender.send(['ab12'], { title: 'a', body: 'b' })).toEqual(
        [],
      );
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it('sends nothing for no tokens', async () => {
    const sender = new ApnsSender(config(APPLE));
    expect(await sender.send([], { title: 'a', body: 'b' })).toEqual([]);
    expect(connect).not.toHaveBeenCalled();
  });

  it("sends an alert to each device on Apple's production service, signed with the key", async () => {
    const sender = new ApnsSender(config(APPLE));

    await sender.send(['ab12', 'cd34'], {
      title: 'Hi',
      body: 'New like',
      data: { url: '/p/1', aps: 'ignored' },
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith('https://api.push.apple.com');
    expect(requests.map((r) => r.headers[':path'])).toEqual([
      '/3/device/ab12',
      '/3/device/cd34',
    ]);
    const { headers, body } = requests[0];
    expect(headers).toMatchObject({
      ':method': 'POST',
      'apns-topic': 'com.circlesfera.app',
      'apns-push-type': 'alert',
    });
    expect(JSON.parse(body)).toEqual({
      url: '/p/1',
      aps: { alert: { title: 'Hi', body: 'New like' }, sound: 'default' },
    });

    const jwt = headers.authorization.replace('bearer ', '');
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY123',
    });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      iss: 'TEAM45',
      iat: expect.any(Number),
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
    // The same signing token serves both devices.
    expect(requests[1].headers.authorization).toBe(headers.authorization);
  });

  it("uses Apple's development service when told to", async () => {
    const sender = new ApnsSender(config({ ...APPLE, APNS_SANDBOX: 'true' }));
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    expect(connect).toHaveBeenCalledWith('https://api.sandbox.push.apple.com');
  });

  it('answers the devices Apple no longer reaches, and keeps the others', async () => {
    answers = {
      dead: { status: 410, reason: 'Unregistered' },
      bad0: { status: 400, reason: 'BadDeviceToken' },
    };
    const sender = new ApnsSender(config(APPLE));

    const gone = await sender.send(['ab12', 'dead', 'bad0'], {
      title: 'a',
      body: 'b',
    });

    expect(gone).toEqual(['dead']);
  });

  it('never calls Apple with a token that is not hexadecimal, and answers it gone', async () => {
    const sender = new ApnsSender(config(APPLE));
    const gone = await sender.send(['../../x'], { title: 'a', body: 'b' });
    expect(gone).toEqual(['../../x']);
    expect(requests).toHaveLength(0);
  });

  it('makes a new signing token after Apple says it expired', async () => {
    answers = { ab12: { status: 403, reason: 'ExpiredProviderToken' } };
    const sender = new ApnsSender(config(APPLE));
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    // Five minutes on: Apple takes no new token yet, so it is kept.
    now.mockReturnValue(1_000_000 + 5 * 60_000);
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    expect(requests[1].headers.authorization).toBe(
      requests[0].headers.authorization,
    );
    // Twenty minutes on, Apple refuses it again: the next send has a new one.
    now.mockReturnValue(1_000_000 + 21 * 60_000);
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    expect(requests[2].headers.authorization).toBe(
      requests[0].headers.authorization,
    );
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    now.mockRestore();
    expect(requests[3].headers.authorization).not.toBe(
      requests[0].headers.authorization,
    );
  });

  it('keeps one connection and opens another once it closed', async () => {
    const sender = new ApnsSender(config(APPLE));
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    expect(connect).toHaveBeenCalledTimes(1);

    const first = connect.mock.results[0].value;
    first.emit('close');
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    expect(connect).toHaveBeenCalledTimes(2);

    // A connection error also makes the next send open a new one.
    connect.mock.results[1].value.emit('error', new Error('reset'));
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    expect(connect).toHaveBeenCalledTimes(3);

    sender.onModuleDestroy();
    expect(connect.mock.results[2].value.close).toHaveBeenCalled();
  });

  it('cancels a request after ten seconds, and reads an answer that is not JSON', async () => {
    answers = { ab12: { status: 500, reason: undefined } };
    connect.mockImplementation(() => {
      const session = fakeSession();
      const request = session.request;
      session.request = vi.fn((headers: Record<string, string>) => {
        const stream = request(headers);
        const end = stream.end;
        stream.end = (body: string) => {
          end(body);
          stream.emit('data', 'not json');
        };
        return stream;
      });
      return session;
    });
    const sender = new ApnsSender(config(APPLE));
    expect(await sender.send(['ab12'], { title: 'a', body: 'b' })).toEqual([]);

    const stream = connect.mock.results[0].value.request.mock.results[0].value;
    const [ms, cancel] = stream.setTimeout.mock.calls[0];
    expect(ms).toBe(10_000);
    cancel();
    expect(stream.close).toHaveBeenCalledWith(8);
    // The connection that did not answer is closed, letting the requests of
    // other devices on it finish; the next send opens another.
    expect(connect.mock.results[0].value.close).toHaveBeenCalled();
    expect(connect.mock.results[0].value.destroy).not.toHaveBeenCalled();
    await sender.send(['ab12'], { title: 'a', body: 'b' });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('gives up on a request that closes with no answer, and keeps the device', async () => {
    connect.mockImplementation(() => {
      const session = fakeSession();
      session.request = vi.fn(() => {
        const stream = Object.assign(new EventEmitter(), {
          setEncoding: vi.fn(),
          setTimeout: vi.fn(),
          close: vi.fn(),
          end: () => queueMicrotask(() => stream.emit('close')),
        });
        return stream;
      });
      return session;
    });
    const sender = new ApnsSender(config(APPLE));
    expect(await sender.send(['ab12'], { title: 'a', body: 'b' })).toEqual([]);
  });

  it('carries on with the other devices when one request fails', async () => {
    connect.mockImplementation(() => {
      const session = fakeSession();
      const request = session.request;
      session.request = vi.fn((headers: Record<string, string>) => {
        const stream = request(headers);
        if (headers[':path'].endsWith('/ee55')) {
          stream.end = () => {
            queueMicrotask(() =>
              stream.emit(
                'error',
                Object.assign(new Error('x'), { code: 'ECONNRESET' }),
              ),
            );
          };
        }
        return stream;
      });
      return session;
    });
    const sender = new ApnsSender(config(APPLE));
    const gone = await sender.send(['ee55', 'ab12'], { title: 'a', body: 'b' });
    expect(gone).toEqual([]);
    expect(requests.map((r) => r.headers[':path'])).toEqual(['/3/device/ab12']);
  });
});
