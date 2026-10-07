import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createControllerApp } from '../common/testing/http-controller.js';
import { CspReportController } from './csp-report.controller.js';
import { CspReportStore } from './csp-report.store.js';

describe('CspReportController', () => {
  let app: INestApplication;
  const store = { record: vi.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [CspReportController],
      providers: [{ provide: CspReportStore, useValue: store }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a report, answers 204 and logs only a sanitized summary', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    await request(app.getHttpServer())
      .post('/api/v1/security/csp-report')
      .send({
        'csp-report': {
          'document-uri': 'https://circlesfera.com/verify-email?token=secret',
          'effective-directive': 'img-src',
          'blocked-uri': 'https://cdn.example.com/a.png',
          disposition: 'report',
        },
      })
      .expect(204);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain(
      'img-src blocked https://cdn.example.com on /verify-email',
    );
    expect(line).not.toContain('secret');
    warn.mockRestore();
  });

  it('answers 204 to an empty or unknown body without logging', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    await request(app.getHttpServer())
      .post('/api/v1/security/csp-report')
      .send({ hello: 'world' })
      .expect(204);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
