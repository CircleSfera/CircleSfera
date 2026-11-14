import { ServiceUnavailableException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ReviewViewLogInterceptor } from './review-view-log.interceptor.js';

describe('ReviewViewLogInterceptor', () => {
  const create = vi.fn();
  const interceptor = new ReviewViewLogInterceptor({
    adminAuditLog: { create },
  } as unknown as PrismaService);
  const context = (user?: { adminId: string }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          path: '/api/v1/admin/review/enforcement',
          originalUrl: '/api/v1/admin/review/enforcement?kind=reports&page=2',
          ip: '203.0.113.9',
          headers: { 'user-agent': 'Reviewer browser' },
        }),
      }),
    }) as never;
  const next = { handle: () => of('page') };

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({});
  });

  it('writes down every page opened: who, which page and filters, from where', async () => {
    const result = await interceptor.intercept(
      context({ adminId: 'rev-1' }),
      next,
    );

    await expect(lastValueFrom(result)).resolves.toBe('page');
    expect(create).toHaveBeenCalledWith({
      data: {
        adminId: 'rev-1',
        action: 'REVIEW_VIEWED',
        targetType: 'review',
        targetId: 'enforcement',
        details: '/api/v1/admin/review/enforcement?kind=reports&page=2',
        ipAddress: '203.0.113.9',
        userAgent: 'Reviewer browser',
      },
    });
  });

  it('does not show a page that cannot be written down', async () => {
    create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      interceptor.intercept(context({ adminId: 'rev-1' }), next),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    create.mockRejectedValueOnce('not an error');
    await expect(
      interceptor.intercept(context({ adminId: 'rev-1' }), next),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('writes nothing without a staff session (the guard has refused it)', async () => {
    await interceptor.intercept(context(), next);
    expect(create).not.toHaveBeenCalled();
  });
});
