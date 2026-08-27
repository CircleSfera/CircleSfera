import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from './system-settings.constants.js';
import { SystemSettingsService } from './system-settings.service.js';

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;
  const store = new Map<string, string>();

  const prisma = {
    systemSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const value = store.get(where.key);
        return value
          ? { key: where.key, value, description: null, updatedBy: 'system' }
          : null;
      }),
      findMany: vi.fn(async () =>
        [...store.entries()].map(([key, value]) => ({
          key,
          value,
          description: null,
          updatedBy: 'system',
        })),
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { key: string };
          create: { key: string; value: string; description?: string };
          update: Record<string, never>;
        }) => {
          if (!store.has(where.key)) {
            store.set(create.key, create.value);
          }
          return { key: where.key, value: store.get(where.key) };
        },
      ),
    },
  };

  const cache = {
    get: vi.fn(async (_key: string) => undefined as string | undefined),
    set: vi.fn(async () => undefined),
    del: vi.fn(async () => undefined),
  };

  beforeEach(async () => {
    store.clear();
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();

    service = module.get(SystemSettingsService);
  });

  it('ensures defaults then reads boolean', async () => {
    expect(await service.isEnabled(SYSTEM_SETTING_KEYS.MAINTENANCE_MODE)).toBe(
      false,
    );
    expect(await service.isEnabled(SYSTEM_SETTING_KEYS.REGISTRATION_OPEN)).toBe(
      true,
    );
    expect(prisma.systemSetting.upsert).toHaveBeenCalled();
  });

  it('uses cached value when present', async () => {
    cache.get.mockResolvedValueOnce('true');
    expect(await service.isEnabled(SYSTEM_SETTING_KEYS.MAINTENANCE_MODE)).toBe(
      true,
    );
    expect(prisma.systemSetting.findUnique).not.toHaveBeenCalled();
  });
});
