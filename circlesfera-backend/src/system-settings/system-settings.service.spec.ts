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
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: { key: string; value: string }[];
          skipDuplicates: boolean;
        }) => {
          let count = 0;
          for (const row of data) {
            if (!store.has(row.key)) {
              store.set(row.key, row.value);
              count++;
            }
          }
          return { count };
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
    // The whole catalog in one statement, never overwriting a value.
    expect(prisma.systemSetting.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('writes the catalog once per process, however many settings are read', async () => {
    for (let i = 0; i < 5; i++) {
      await service.isEnabled(SYSTEM_SETTING_KEYS.MAINTENANCE_MODE);
      await service.isEnabled(SYSTEM_SETTING_KEYS.REGISTRATION_OPEN);
    }
    await service.list();

    expect(prisma.systemSetting.createMany).toHaveBeenCalledTimes(1);
  });

  it('tries the catalog again after a failure', async () => {
    prisma.systemSetting.createMany.mockRejectedValueOnce(new Error('db'));

    await expect(
      service.isEnabled(SYSTEM_SETTING_KEYS.MAINTENANCE_MODE),
    ).rejects.toThrow('db');
    expect(await service.isEnabled(SYSTEM_SETTING_KEYS.MAINTENANCE_MODE)).toBe(
      false,
    );
    expect(prisma.systemSetting.createMany).toHaveBeenCalledTimes(2);
  });

  it('uses cached value when present', async () => {
    cache.get.mockResolvedValueOnce('true');
    expect(await service.isEnabled(SYSTEM_SETTING_KEYS.MAINTENANCE_MODE)).toBe(
      true,
    );
    expect(prisma.systemSetting.findUnique).not.toHaveBeenCalled();
  });

  it('lists all system settings after ensuring defaults', async () => {
    const list = await service.list();
    expect(prisma.systemSetting.findMany).toHaveBeenCalledWith({
      orderBy: { key: 'asc' },
    });
    expect(Array.isArray(list)).toBe(true);
  });

  it('invalidates all system settings keys in cache', async () => {
    await service.invalidateAll();
    expect(cache.del).toHaveBeenCalled();
  });

  it('falls back to default when row has invalid or missing value', async () => {
    cache.get.mockResolvedValueOnce(undefined);
    prisma.systemSetting.findUnique.mockResolvedValueOnce({
      key: SYSTEM_SETTING_KEYS.MAINTENANCE_MODE,
      value: 'unexpected-non-boolean',
      description: null,
      updatedBy: 'system',
    } as any);

    const value = await service.getValue(SYSTEM_SETTING_KEYS.MAINTENANCE_MODE);
    expect(value).toBe('false');
  });

  it('falls back to false string for unknown key not in defaults', async () => {
    cache.get.mockResolvedValueOnce(undefined);
    prisma.systemSetting.findUnique.mockResolvedValueOnce(null);

    const value = await service.getValue('UNKNOWN_KEY' as any);
    expect(value).toBe('false');
  });
});
