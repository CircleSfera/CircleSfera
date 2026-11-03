import {
  type ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MaintenanceModeGuard } from './maintenance-mode.guard.js';
import type { SystemSettingsService } from './system-settings.service.js';

function at(url: string, type = 'http'): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => ({ originalUrl: url }) }),
  } as unknown as ExecutionContext;
}

function guard(maintenance: boolean) {
  const isEnabled = vi.fn().mockResolvedValue(maintenance);
  return {
    guard: new MaintenanceModeGuard({
      isEnabled,
    } as unknown as SystemSettingsService),
    isEnabled,
  };
}

describe('MaintenanceModeGuard', () => {
  it('answers 503 to a route of the app while in maintenance', async () => {
    await expect(
      guard(true).guard.canActivate(at('/api/v1/posts?x=1')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('lets every route through when not in maintenance', async () => {
    await expect(
      guard(false).guard.canActivate(at('/api/v1/posts')),
    ).resolves.toBe(true);
  });

  it.each([
    '/api/v1/health',
    '/api/v1/payments/webhook',
    '/api/v1/live/livekit/webhook',
    '/api/v1/admin/reports',
  ])('lets %s through even in maintenance, without asking', async (url) => {
    const { guard: g, isEnabled } = guard(true);
    await expect(g.canActivate(at(url))).resolves.toBe(true);
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('does not let through a route that only starts with the same letters', async () => {
    await expect(
      guard(true).guard.canActivate(at('/api/v1/live/livekit/webhooks-other')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('lets anything but HTTP through', async () => {
    await expect(guard(true).guard.canActivate(at('/x', 'ws'))).resolves.toBe(
      true,
    );
  });
});
