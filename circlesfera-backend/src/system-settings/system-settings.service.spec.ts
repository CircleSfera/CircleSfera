import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  isValidSettingValue,
  SYSTEM_SETTING_DEFAULTS,
  SYSTEM_SETTING_KEYS,
} from './system-settings.constants.js';
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

  describe('the limits of lives and recordings (PD-092)', () => {
    it('start at 10 lives and 2 recordings at once', async () => {
      expect(
        await service.getNumber(SYSTEM_SETTING_KEYS.MAX_CONCURRENT_LIVES),
      ).toBe(10);
      expect(
        await service.getNumber(SYSTEM_SETTING_KEYS.MAX_CONCURRENT_RECORDINGS),
      ).toBe(2);
    });

    it('read what staff set', async () => {
      store.set(SYSTEM_SETTING_KEYS.MAX_CONCURRENT_LIVES, '25');
      expect(
        await service.getNumber(SYSTEM_SETTING_KEYS.MAX_CONCURRENT_LIVES),
      ).toBe(25);
    });

    it.each(['0', '-3', '2.5', 'ten', '', '100000'])(
      'read a stored %j as the default, never as no limit or none',
      async (value) => {
        store.set(SYSTEM_SETTING_KEYS.MAX_CONCURRENT_RECORDINGS, value);
        expect(
          await service.getNumber(
            SYSTEM_SETTING_KEYS.MAX_CONCURRENT_RECORDINGS,
          ),
        ).toBe(2);
      },
    );
  });

  it.each([
    ['max_concurrent_lives', '1', true],
    ['max_concurrent_lives', '500', true],
    ['max_concurrent_lives', '501', false],
    ['max_concurrent_lives', '0', false],
    ['max_concurrent_lives', ' 10', false],
    ['max_concurrent_recordings', '50', true],
    ['max_concurrent_recordings', '51', false],
    ['max_concurrent_recordings', 'true', false],
    ['maintenance_mode', 'true', true],
    ['maintenance_mode', '1', false],
  ])('a value of %s of %j fits: %s', (key, value, fits) => {
    expect(isValidSettingValue(key, value)).toBe(fits);
  });

  it('sells promotions unless staff turn them off', () => {
    expect(
      SYSTEM_SETTING_DEFAULTS.find(
        (d) => d.key === SYSTEM_SETTING_KEYS.PROMOTIONS_ON_SALE,
      )?.value,
    ).toBe('true');
  });
});
