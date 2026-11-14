import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { CompanyVerificationController } from './company-verification.controller.js';
import { CompanyVerificationService } from './company-verification.service.js';

describe('CompanyVerificationController', () => {
  let app: INestApplication;
  const service = {
    status: vi.fn(),
    saveDetails: vi.fn(),
    checkDomain: vi.fn(),
    sendEmailCode: vi.fn(),
    confirmEmailCode: vi.fn(),
    addDocument: vi.fn(),
    removeDocument: vi.fn(),
    submit: vi.fn(),
    withdraw: vi.fn(),
  };
  const who = [TEST_USER.userId, TEST_USER.profileId];

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [CompanyVerificationController],
      providers: [{ provide: CompanyVerificationService, useValue: service }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(service)) fn.mockResolvedValue({ ok: 1 });
  });

  it('acts only for the session, and needs one', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/company-verification')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/company-verification')
      .set(BEARER)
      .expect(200, { ok: 1 });
    expect(service.status).toHaveBeenCalledWith(...who);
  });

  it('takes the company details, and refuses an unknown kind or extra fields', async () => {
    const body = {
      kind: 'COMPANY',
      legalName: ' Acme SL ',
      taxId: 'B12345674',
      domain: 'acme.es',
    };
    await request(app.getHttpServer())
      .put('/api/v1/company-verification')
      .set(BEARER)
      .send(body)
      .expect(200);
    expect(service.saveDetails).toHaveBeenCalledWith(...who, {
      ...body,
      legalName: 'Acme SL',
    });
    await request(app.getHttpServer())
      .put('/api/v1/company-verification')
      .set(BEARER)
      .send({ ...body, kind: 'NGO' })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/company-verification')
      .set(BEARER)
      .send({ ...body, status: 'APPROVED' })
      .expect(400);
    expect(service.saveDetails).toHaveBeenCalledTimes(1);
  });

  it('checks the domain, sends and confirms the code', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/v1/company-verification/domain/check')
      .set(BEARER)
      .expect(200);
    await request(server)
      .post('/api/v1/company-verification/domain/email')
      .set(BEARER)
      .send({ localPart: ' info ' })
      .expect(200);
    await request(server)
      .post('/api/v1/company-verification/domain/email/confirm')
      .set(BEARER)
      .send({ code: '123456' })
      .expect(200);
    await request(server)
      .post('/api/v1/company-verification/domain/email/confirm')
      .set(BEARER)
      .send({ code: '12ab56' })
      .expect(400);
    expect(service.checkDomain).toHaveBeenCalledWith(...who);
    expect(service.sendEmailCode).toHaveBeenCalledWith(...who, 'info');
    expect(service.confirmEmailCode).toHaveBeenCalledTimes(1);
    expect(service.confirmEmailCode).toHaveBeenCalledWith(...who, '123456');
  });

  it('takes one document at a time, and removes one named by a valid id', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/v1/company-verification/documents')
      .set(BEARER)
      .attach('file', Buffer.from('%PDF-1.7'), 'cif.pdf')
      .expect(201);
    expect(service.addDocument.mock.calls[0][2]).toMatchObject({
      originalname: 'cif.pdf',
    });
    await request(server)
      .delete('/api/v1/company-verification/documents/not-a-uuid')
      .set(BEARER)
      .expect(400);
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    await request(server)
      .delete(`/api/v1/company-verification/documents/${id}`)
      .set(BEARER)
      .expect(200);
    expect(service.removeDocument).toHaveBeenCalledWith(...who, id);
  });

  it('sends and withdraws the application', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/v1/company-verification/submit')
      .set(BEARER)
      .expect(200);
    await request(server)
      .post('/api/v1/company-verification/withdraw')
      .set(BEARER)
      .expect(200);
    expect(service.submit).toHaveBeenCalledWith(...who);
    expect(service.withdraw).toHaveBeenCalledWith(...who);
  });
});
