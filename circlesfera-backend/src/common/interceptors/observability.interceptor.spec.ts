import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CorrelationContext } from '../correlation/correlation.context.js';
import { ObservabilityInterceptor } from './observability.interceptor.js';

describe('ObservabilityInterceptor', () => {
  it('passes non-HTTP contexts transparently', async () => {
    const interceptor = new ObservabilityInterceptor();
    const context = {
      getType: () => 'ws',
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    const result = await new Promise((resolve) => {
      interceptor.intercept(context, next).subscribe(resolve);
    });

    expect(result).toEqual({ ok: true });
  });

  it('skips health endpoints without logging', async () => {
    const interceptor = new ObservabilityInterceptor();
    const req = {
      method: 'GET',
      originalUrl: '/api/v1/health/liveness',
      headers: {},
    } as Request;
    const res = {
      statusCode: 200,
      getHeader: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as Response;

    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of({ status: 'ok' }),
    };

    const result = await new Promise((resolve) => {
      interceptor.intercept(context, next).subscribe(resolve);
    });

    expect(result).toEqual({ status: 'ok' });
  });

  it('sets x-correlation-id on response header if not already set', async () => {
    const interceptor = new ObservabilityInterceptor();
    const req = {
      method: 'GET',
      originalUrl: '/api/v1/posts',
      headers: { 'x-correlation-id': 'cs_test_obs_header' },
    } as unknown as Request;
    const setHeaders: Record<string, string> = {};
    const res = {
      statusCode: 200,
      getHeader: (k: string) => setHeaders[k],
      setHeader: (k: string, v: string) => {
        setHeaders[k] = v;
      },
    } as unknown as Response;

    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of([{ id: 'post-1' }]),
    };

    await CorrelationContext.run('cs_test_obs_header', async () => {
      await new Promise((resolve) => {
        interceptor.intercept(context, next).subscribe(resolve);
      });
    });

    expect(setHeaders['x-correlation-id']).toBe('cs_test_obs_header');
  });
});
