import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { AdminService } from './admin.service.js';

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: {
            user: { count: async () => 10 },
            post: { count: async () => 20 },
            story: { count: async () => 5 },
            report: { count: async () => 2 },
            $queryRaw: async () => [1],
            webhookEvent: { count: async () => 0 },
            systemSetting: {
              findMany: async () => [],
              upsert: async () => ({}),
            },
          },
        },
        {
          provide: getQueueToken('ai-processing'),
          useValue: {
            getJobCounts: async () => ({
              wait: 0,
              active: 0,
              failed: 0,
              completed: 0,
            }),
          },
        },
        {
          provide: getQueueToken('analytics-processing'),
          useValue: {
            getJobCounts: async () => ({
              wait: 0,
              active: 0,
              failed: 0,
              completed: 0,
            }),
          },
        },
        {
          provide: SystemSettingsService,
          useValue: {
            list: async () => [],
            invalidateAll: async () => undefined,
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStats', () => {
    it('should return basic stats', async () => {
      const stats = await service.getStats();
      expect(stats).toEqual({
        users: 10,
        posts: 20,
        stories: 5,
        pendingReports: 2,
      });
    });
  });

  describe('getSystemHealth', () => {
    it('should return system health', async () => {
      const health = await service.getSystemHealth();
      expect(health.database.status).toBe('ONLINE');
    });
  });

  describe('updateSystemSettings', () => {
    const upsert = vi.fn(async () => ({}));
    const invalidateAll = vi.fn(async () => undefined);
    const auditLog = vi.fn(async () => ({}));
    const admin = () =>
      new AdminService(
        {
          systemSetting: { upsert },
          adminAuditLog: { create: auditLog },
        } as never,
        {} as never,
        {} as never,
        { invalidateAll } as never,
      );

    beforeEach(() => vi.clearAllMocks());

    it('saves a limit of lives within its range, and drops the cached settings', async () => {
      await expect(
        admin().updateSystemSettings('staff-1', [
          { key: 'max_concurrent_lives', value: '25' },
          { key: 'max_concurrent_recordings', value: '3' },
        ]),
      ).resolves.toEqual({ count: 2 });
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(invalidateAll).toHaveBeenCalled();
    });

    it.each([
      ['max_concurrent_lives', '0'],
      ['max_concurrent_lives', '501'],
      ['max_concurrent_lives', 'ten'],
      ['max_concurrent_recordings', '-1'],
      ['max_concurrent_recordings', '1.5'],
      ['maintenance_mode', 'yes'],
    ])(
      'refuses %s = %j and writes nothing of the batch',
      async (key, value) => {
        await expect(
          admin().updateSystemSettings('staff-1', [
            { key: 'registration_open', value: 'false' },
            { key, value },
          ]),
        ).rejects.toMatchObject({ errorCode: 'INVALID_INPUT', status: 400 });
        expect(upsert).not.toHaveBeenCalled();
        expect(auditLog).not.toHaveBeenCalled();
      },
    );

    it('says the range in what it refuses', async () => {
      await expect(
        admin().updateSystemSettings('staff-1', [
          { key: 'max_concurrent_recordings', value: '0' },
        ]),
      ).rejects.toMatchObject({
        details: { key: 'max_concurrent_recordings', min: 1, max: 50 },
      });
    });
  });
});
