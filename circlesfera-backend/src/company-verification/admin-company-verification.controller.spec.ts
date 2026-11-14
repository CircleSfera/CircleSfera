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
import {
  AdminGuard,
  STAFF_PERMISSIONS_KEY,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  createControllerApp,
  TEST_ADMIN,
  TEST_UUID,
} from '../common/testing/http-controller.js';
import { AdminCompanyVerificationController } from './admin-company-verification.controller.js';
import { CompanyVerificationReviewService } from './company-verification-review.service.js';

describe('AdminCompanyVerificationController', () => {
  let app: INestApplication;
  const review = {
    queue: vi.fn(),
    detail: vi.fn(),
    document: vi.fn(),
    decide: vi.fn(),
    identityName: vi.fn(),
  };
  const DOC = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminCompanyVerificationController],
      providers: [
        { provide: CompanyVerificationReviewService, useValue: review },
      ],
      guards: [
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: AdminGuard, mode: 'allow' },
      ],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    review.queue.mockResolvedValue({ items: [], total: 0 });
    review.detail.mockResolvedValue({ id: TEST_UUID });
    review.decide.mockResolvedValue({ id: TEST_UUID });
    review.document.mockResolvedValue({
      fileName: 'CIF Acme.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('%PDF-1.7'),
    });
  });

  it('is for staff with the company-verification permission only', () => {
    expect(
      Reflect.getMetadata(
        STAFF_PERMISSIONS_KEY,
        AdminCompanyVerificationController,
      ),
    ).toEqual(['company_verification']);
  });

  it('needs a staff session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/company-verifications')
      .expect(401);
    expect(review.queue).not.toHaveBeenCalled();
  });

  it('lists the queue and shows one application by a valid id', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/api/v1/admin/company-verifications')
      .set(ADMIN_BEARER)
      .expect(200, { items: [], total: 0 });
    await request(server)
      .get('/api/v1/admin/company-verifications/nope')
      .set(ADMIN_BEARER)
      .expect(400);
    await request(server)
      .get(`/api/v1/admin/company-verifications/${TEST_UUID}`)
      .set(ADMIN_BEARER)
      .expect(200);
    expect(review.detail).toHaveBeenCalledWith(TEST_UUID);
  });

  it('serves a document never cached, never sniffed and never run, for the member of staff who opens it', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/company-verifications/${TEST_UUID}/documents/${DOC}`)
      .set(ADMIN_BEARER)
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['content-disposition']).toBe(
      'inline; filename="CIF%20Acme.pdf"',
    );
    expect(review.document).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      TEST_UUID,
      DOC,
    );
  });

  it('gives the verified name of a sole trader, never cached', async () => {
    review.identityName.mockResolvedValue({
      name: { firstName: 'Ana', lastName: 'Ruiz' },
    });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/company-verifications/${TEST_UUID}/identity-name`)
      .set(ADMIN_BEARER)
      .expect(200);
    expect(res.body).toEqual({ name: { firstName: 'Ana', lastName: 'Ruiz' } });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(review.identityName).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      TEST_UUID,
    );
  });

  it('takes a decision, and refuses a rejection without a known reason', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post(`/api/v1/admin/company-verifications/${TEST_UUID}/decision`)
      .set(ADMIN_BEARER)
      .send({ approve: false, reason: 'DETAILS_DO_NOT_MATCH', note: ' x ' })
      .expect(200);
    expect(review.decide).toHaveBeenCalledWith(TEST_ADMIN.adminId, TEST_UUID, {
      approve: false,
      reason: 'DETAILS_DO_NOT_MATCH',
      note: 'x',
    });
    await request(server)
      .post(`/api/v1/admin/company-verifications/${TEST_UUID}/decision`)
      .set(ADMIN_BEARER)
      .send({ approve: false, reason: 'BAD' })
      .expect(400);
    await request(server)
      .post(`/api/v1/admin/company-verifications/${TEST_UUID}/decision`)
      .set(ADMIN_BEARER)
      .send({ approve: true })
      .expect(200);
    expect(review.decide).toHaveBeenCalledTimes(2);
  });
});
