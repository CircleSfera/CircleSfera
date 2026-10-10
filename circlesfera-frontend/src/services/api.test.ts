import axios, {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adminPanel = vi.hoisted(() => ({ value: false }));
vi.mock('../utils/adminPanel', () => ({
  // The client asks whether it is on a staff site: the Admin Panel or the
  // Backoffice.
  isStaffHost: () => adminPanel.value,
}));
const notifyActionLimit = vi.hoisted(() => vi.fn());
vi.mock('../utils/actionLimit', () => ({ notifyActionLimit }));
vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { apiClient } from './api';

type Reply = { status: number; data?: unknown } | 'network';

// Answers the client's own requests in order, recording what was sent.
function serve(replies: Reply[]) {
  const sent: InternalAxiosRequestConfig[] = [];
  apiClient.defaults.adapter = async (config) => {
    sent.push(config);
    const reply = replies.shift() ?? { status: 200, data: {} };
    if (reply === 'network') {
      throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    }
    const response = {
      data: reply.data ?? {},
      status: reply.status,
      statusText: '',
      headers: {},
      config,
    } as AxiosResponse;
    if (reply.status >= 400) {
      throw new AxiosError(
        'Request failed',
        String(reply.status),
        config,
        undefined,
        response,
      );
    }
    return response;
  };
  return sent;
}

const csrf = (token: string) =>
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { csrfToken: token } });

const originalLocation = window.location;
const location = { pathname: '/', href: '/' };

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    notifyActionLimit.mockReset();
    adminPanel.value = false;
    location.pathname = '/';
    location.href = '/';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('sends a CSRF token only on writes, fetching it once for concurrent writes', async () => {
    const get = csrf('t-1');
    // A sign-in response clears any token left by an earlier test.
    serve([{ status: 200 }]);
    await apiClient.post('/auth/login', {});
    get.mockClear();
    const sent = serve([{ status: 200 }, { status: 200 }, { status: 200 }]);

    await apiClient.get('/feed');
    await Promise.all([apiClient.post('/a', {}), apiClient.put('/b', {})]);

    expect(sent[0].headers['x-csrf-token']).toBeUndefined();
    expect(sent[1].headers['x-csrf-token']).toBe('t-1');
    expect(sent[2].headers['x-csrf-token']).toBe('t-1');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('drops the CSRF token after signing in, so the next write gets a fresh one', async () => {
    const get = csrf('t-old');
    serve([{ status: 200 }, { status: 200 }]);
    await apiClient.post('/posts', {});
    await apiClient.post('/auth/login', {});
    get.mockResolvedValue({ data: { csrfToken: 't-new' } });
    const sent = serve([{ status: 200 }]);

    await apiClient.post('/posts', {});

    expect(sent[0].headers['x-csrf-token']).toBe('t-new');
  });

  it('retries a refused write once with a new CSRF token', async () => {
    csrf('t-2');
    const sent = serve([{ status: 403 }, { status: 200, data: { ok: true } }]);

    const res = await apiClient.post('/comments', {});

    expect(res.data).toEqual({ ok: true });
    expect(sent).toHaveLength(2);
    expect(sent[1].headers['x-csrf-token']).toBe('t-2');
  });

  it('gives up after the CSRF retry, or when no new token can be fetched', async () => {
    csrf('t-3');
    serve([
      { status: 403 },
      { status: 403, data: { errorCode: 'FORBIDDEN_ACCESS' } },
    ]);
    await expect(apiClient.post('/x', {})).rejects.toMatchObject({
      status: 403,
      data: { errorCode: 'FORBIDDEN_ACCESS' },
    });

    vi.spyOn(axios, 'get').mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent = serve([{ status: 403 }]);
    await expect(apiClient.post('/login-required', {})).rejects.toMatchObject({
      status: 403,
    });
    expect(sent).toHaveLength(1);
  });

  it('renews an expired session once and repeats the request', async () => {
    csrf('t-4');
    const post = vi.spyOn(axios, 'post').mockResolvedValue({});
    const sent = serve([{ status: 401 }, { status: 200, data: { me: 1 } }]);

    const res = await apiClient.get('/profiles/me');

    expect(post).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/refresh$/),
      {},
      { withCredentials: true },
    );
    expect(res.data).toEqual({ me: 1 });
    expect(sent).toHaveLength(2);
  });

  it('never tries to renew the session for sign-in itself', async () => {
    csrf('t-5');
    const post = vi.spyOn(axios, 'post');
    serve([{ status: 401, data: { errorCode: 'HTTP_EXCEPTION' } }]);

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({
      status: 401,
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the participant to sign in when the session cannot be renewed', async () => {
    csrf('t-6');
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('expired'));
    const events: string[] = [];
    const listener = (e: Event) => events.push(e.type);
    window.addEventListener('auth:unauthorized', listener);
    location.pathname = '/feed';
    serve([{ status: 401 }]);

    await expect(apiClient.get('/feed')).rejects.toThrow('expired');

    expect(events).toEqual(['auth:unauthorized']);
    expect(location.href).toBe('/accounts/login');
    window.removeEventListener('auth:unauthorized', listener);
  });

  it('does not redirect when already on an account page', async () => {
    csrf('t-7');
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('expired'));
    location.pathname = '/accounts/login';
    serve([{ status: 401 }]);

    await expect(apiClient.get('/profiles/me')).rejects.toThrow();
    expect(location.href).toBe('/');
  });

  it('on the staff panel renews through the staff endpoint and sends staff to /login', async () => {
    adminPanel.value = true;
    csrf('t-8');
    const post = vi
      .spyOn(axios, 'post')
      .mockRejectedValue(new Error('expired'));
    const events: string[] = [];
    const listener = (e: Event) => events.push(e.type);
    window.addEventListener('auth:admin_unauthorized', listener);
    location.pathname = '/reports';
    serve([{ status: 401 }]);

    await expect(apiClient.get('/admin/reports')).rejects.toThrow();

    expect(post).toHaveBeenCalledWith(
      expect.stringMatching(/\/admin-auth\/refresh$/),
      {},
      { withCredentials: true },
    );
    expect(events).toEqual(['auth:admin_unauthorized']);
    expect(location.href).toBe('/login');
    window.removeEventListener('auth:admin_unauthorized', listener);
  });

  it('passes through errors it cannot retry: no request config, or a failed request setup', async () => {
    type Handlers = {
      handlers: Array<{ rejected?: (e: unknown) => Promise<unknown> }>;
    };
    const response = apiClient.interceptors.response as unknown as Handlers;
    const request = apiClient.interceptors.request as unknown as Handlers;
    const bare = new Error('no config');

    await expect(response.handlers[0].rejected?.(bare)).rejects.toBe(bare);
    await expect(request.handlers[0].rejected?.(bare)).rejects.toBe(bare);
  });

  it('tells the participant about a reached action limit', async () => {
    csrf('t-9');
    const body = {
      errorCode: 'ACTION_LIMIT_REACHED',
      details: { action: 'follow' },
    };
    serve([{ status: 429, data: body }]);

    await expect(apiClient.post('/follows', {})).rejects.toMatchObject({
      status: 429,
    });
    expect(notifyActionLimit).toHaveBeenCalledWith(
      429,
      body,
      expect.any(Function),
    );
  });
});
