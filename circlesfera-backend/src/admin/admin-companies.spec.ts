import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
} from '../common/testing/http-controller.js';
import { AdminCompaniesController } from './admin-companies.controller.js';
import { AdminCompaniesService } from './admin-companies.service.js';

// The staff list of Business Profiles and why each has the "Verified
// company" label or not: what it asks the database for, and its route.
describe('AdminCompaniesService', () => {
  const prisma = {
    profile: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    monetization: { findUnique: vi.fn() },
  };
  const service = new AdminCompaniesService(prisma as never);
  const profile = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    userId: 'u1',
    username: 'acme',
    fullName: 'Acme',
    avatar: null,
    verificationLevel: 'BUSINESS',
    ...over,
  });
  const row = (over: Record<string, unknown> = {}) => ({
    userId: 'u1',
    profileId: 'p1',
    stripeConnectAccountId: 'acct_1',
    transfersEnabled: true,
    chargesEnabled: true,
    verifiedCompany: true,
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.profile.count.mockResolvedValue(1);
  });

  it('lists Business Profiles only, newest first, searching handle or name', async () => {
    prisma.profile.findMany.mockResolvedValue([]);
    prisma.profile.count.mockResolvedValue(0);

    await service.getCompanies(2, 10, '  acme ');

    expect(prisma.profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountType: 'BUSINESS',
          OR: [
            { username: { contains: 'acme', mode: 'insensitive' } },
            { fullName: { contains: 'acme', mode: 'insensitive' } },
          ],
        },
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('shows the label only with the Business plan and a company the provider verified', async () => {
    prisma.profile.findMany.mockResolvedValue([profile()]);
    prisma.monetization.findUnique.mockResolvedValue(row());

    const { data, meta } = await service.getCompanies();

    expect(data).toEqual([
      {
        id: 'p1',
        username: 'acme',
        fullName: 'Acme',
        avatar: null,
        onBusinessPlan: true,
        payoutConnected: true,
        companyVerified: true,
        labelShown: true,
      },
    ]);
    expect(meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('says which condition is missing', async () => {
    prisma.profile.findMany.mockResolvedValue([
      profile({ id: 'a', verificationLevel: 'BASIC' }),
      profile({ id: 'b' }),
      profile({ id: 'c' }),
    ]);
    prisma.monetization.findUnique
      // a: on no plan, verified company
      .mockResolvedValueOnce(row())
      // b: no account of its own, and none of its person
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      // c: an account the provider has not verified as a company
      .mockResolvedValueOnce(row({ verifiedCompany: false }));

    const { data } = await service.getCompanies();

    expect(
      data.map((d) => [
        d.id,
        d.onBusinessPlan,
        d.payoutConnected,
        d.companyVerified,
        d.labelShown,
      ]),
    ).toEqual([
      ['a', false, true, true, false],
      ['b', true, false, false, false],
      ['c', true, true, false, false],
    ]);
  });

  it("reads the account a Profile is paid into: its person's when it has none ready", async () => {
    prisma.profile.findMany.mockResolvedValue([profile()]);
    prisma.monetization.findUnique
      .mockResolvedValueOnce(
        row({ userId: null, transfersEnabled: false, verifiedCompany: false }),
      )
      .mockResolvedValueOnce(row());

    const { data } = await service.getCompanies();

    expect(prisma.monetization.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(data[0].labelShown).toBe(true);
  });
});

describe('AdminCompaniesController', () => {
  let app: INestApplication;
  const mockService = { getCompanies: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminCompaniesController],
      providers: [{ provide: AdminCompaniesService, useValue: mockService }],
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
    mockService.getCompanies.mockResolvedValue({ data: [], meta: {} });
  });

  it('requires the payments permission', () => {
    expect(
      new Reflector().get(STAFF_PERMISSIONS_KEY, AdminCompaniesController),
    ).toEqual(['payments']);
  });

  it('answers 401 without a staff session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/companies')
      .expect(401);
  });

  it('passes the page and the search to the list', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/companies?page=2&limit=10&search=acme')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getCompanies).toHaveBeenCalledWith(2, 10, 'acme');
  });

  it('rejects a search that is too long', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/companies?search=${'a'.repeat(61)}`)
      .set(ADMIN_BEARER)
      .expect(400);
  });
});
