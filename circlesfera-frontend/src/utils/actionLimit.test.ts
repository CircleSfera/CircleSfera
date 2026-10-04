import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyActionLimit } from './actionLimit';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

const t = vi.fn((key: string, vars?: Record<string, unknown>) =>
  vars?.time !== undefined ? `${key}@${vars.time}` : key,
) as never;

describe('notifyActionLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a localized notice for a reached cap, once per error', () => {
    const handled = notifyActionLimit(
      429,
      {
        errorCode: 'ACTION_LIMIT_REACHED',
        details: { action: 'follow', retryAt: '2026-10-05T11:00:00.000Z' },
      },
      t,
    );

    expect(handled).toBe(true);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('errors.action_limit.follow@'),
      { id: 'action-limit' },
    );
  });

  it('uses a generic notice for an unknown action', () => {
    notifyActionLimit(
      429,
      { errorCode: 'ACTION_LIMIT_REACHED', details: { action: 'other' } },
      t,
    );
    expect(toast.error).toHaveBeenCalledWith('errors.action_limit.other@', {
      id: 'action-limit',
    });
  });

  it('ignores other errors, including the global request throttle', () => {
    expect(notifyActionLimit(429, { message: 'ThrottlerException' }, t)).toBe(
      false,
    );
    expect(
      notifyActionLimit(400, { errorCode: 'ACTION_LIMIT_REACHED' }, t),
    ).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
