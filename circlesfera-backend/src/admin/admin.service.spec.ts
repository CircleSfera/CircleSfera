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
});
