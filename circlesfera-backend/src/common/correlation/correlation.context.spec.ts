import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import {
  attachJobCorrelation,
  withJobCorrelation,
} from './bullmq-correlation.util.js';
import { CorrelationContext } from './correlation.context.js';
import { CorrelationMiddleware } from './correlation.middleware.js';

describe('Distributed Correlation Context', () => {
  describe('CorrelationContext', () => {
    it('generates unique ids with cs_ prefix', () => {
      const id1 = CorrelationContext.generateId();
      const id2 = CorrelationContext.generateId();

      expect(id1.startsWith('cs_')).toBe(true);
      expect(id2.startsWith('cs_')).toBe(true);
      expect(id1).not.toBe(id2);
    });

    it('returns undefined when accessed outside of a correlation context', () => {
      expect(CorrelationContext.getId()).toBeUndefined();
    });

    it('propagates correlation id across async operations inside .run()', async () => {
      const testId = 'cs_test_12345';

      await CorrelationContext.run(testId, async () => {
        expect(CorrelationContext.getId()).toBe(testId);

        await new Promise((resolve) => setTimeout(resolve, 5));

        expect(CorrelationContext.getId()).toBe(testId);
      });

      expect(CorrelationContext.getId()).toBeUndefined();
    });

    it('supports nested correlation scopes correctly', () => {
      CorrelationContext.run('cs_outer', () => {
        expect(CorrelationContext.getId()).toBe('cs_outer');

        CorrelationContext.run('cs_inner', () => {
          expect(CorrelationContext.getId()).toBe('cs_inner');
        });

        expect(CorrelationContext.getId()).toBe('cs_outer');
      });
    });
  });

  describe('CorrelationMiddleware', () => {
    it('preserves incoming x-correlation-id and sets response headers', () => {
      const middleware = new CorrelationMiddleware();
      const req = {
        headers: { 'x-correlation-id': 'client-corr-999' },
      } as unknown as Request;
      const setHeaders: Record<string, string> = {};
      const res = {
        setHeader: (k: string, v: string) => {
          setHeaders[k] = v;
        },
      } as unknown as Response;

      let capturedContextId: string | undefined;
      middleware.use(req, res, () => {
        capturedContextId = CorrelationContext.getId();
      });

      expect(capturedContextId).toBe('client-corr-999');
      expect(req.headers['x-correlation-id']).toBe('client-corr-999');
      expect(req.headers['x-request-id']).toBe('client-corr-999');
      expect(setHeaders['x-correlation-id']).toBe('client-corr-999');
      expect(setHeaders['x-request-id']).toBe('client-corr-999');
    });

    it('falls back to incoming x-request-id if x-correlation-id is omitted', () => {
      const middleware = new CorrelationMiddleware();
      const req = {
        headers: { 'x-request-id': 'req-fallback-456' },
      } as unknown as Request;
      const setHeaders: Record<string, string> = {};
      const res = {
        setHeader: (k: string, v: string) => {
          setHeaders[k] = v;
        },
      } as unknown as Response;

      let capturedContextId: string | undefined;
      middleware.use(req, res, () => {
        capturedContextId = CorrelationContext.getId();
      });

      expect(capturedContextId).toBe('req-fallback-456');
      expect(setHeaders['x-correlation-id']).toBe('req-fallback-456');
    });

    it('generates a new correlation id if no headers are provided', () => {
      const middleware = new CorrelationMiddleware();
      const req = { headers: {} } as unknown as Request;
      const setHeaders: Record<string, string> = {};
      const res = {
        setHeader: (k: string, v: string) => {
          setHeaders[k] = v;
        },
      } as unknown as Response;

      let capturedContextId: string | undefined;
      middleware.use(req, res, () => {
        capturedContextId = CorrelationContext.getId();
      });

      expect(capturedContextId?.startsWith('cs_')).toBe(true);
      expect(setHeaders['x-correlation-id']).toBe(capturedContextId);
    });
  });

  describe('BullMQ correlation utilities', () => {
    it('attaches current correlation id to job payload', () => {
      CorrelationContext.run('cs_job_source_1', () => {
        const payload = attachJobCorrelation({ event: 'test.dispatched' });
        expect(payload._correlationId).toBe('cs_job_source_1');
        expect(payload.event).toBe('test.dispatched');
      });
    });

    it('attaches freshly generated correlation id if outside context', () => {
      const payload = attachJobCorrelation({ foo: 'bar' });
      expect(payload._correlationId.startsWith('cs_')).toBe(true);
    });

    it('withJobCorrelation extracts _correlationId from job data', async () => {
      const mockJob = {
        id: 'job-101',
        data: { _correlationId: 'cs_custom_job_id' },
      };

      await withJobCorrelation(mockJob as never, async () => {
        expect(CorrelationContext.getId()).toBe('cs_custom_job_id');
      });
    });

    it('withJobCorrelation falls back to job id if _correlationId is absent', async () => {
      const mockJob = {
        id: 'job-555',
        data: {},
      };

      await withJobCorrelation(mockJob as never, async () => {
        expect(CorrelationContext.getId()).toBe('job_job-555');
      });
    });
  });
});
