import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  isValidSettingValue,
  SYSTEM_SETTING_CACHE_TTL_MS,
  SYSTEM_SETTING_DEFAULTS,
  type SystemSettingKey,
} from './system-settings.constants.js';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // Insert missing catalog rows without overwriting existing values: one
  // statement for the whole catalog.
  async ensureDefaults(updatedBy = 'system'): Promise<void> {
    await this.prisma.systemSetting.createMany({
      data: SYSTEM_SETTING_DEFAULTS.map((setting) => ({
        key: setting.key,
        value: setting.value,
        description: setting.description,
        updatedBy,
      })),
      skipDuplicates: true,
    });
  }

  // The catalog is written once per process, not on every cache miss: every
  // request reads a setting (maintenance mode), and doing it each time ran
  // one query per setting.
  private defaultsReady?: Promise<void>;

  private ensureDefaultsOnce(): Promise<void> {
    this.defaultsReady ??= this.ensureDefaults().catch((err) => {
      this.defaultsReady = undefined;
      throw err;
    });
    return this.defaultsReady;
  }

  async list() {
    await this.ensureDefaultsOnce();
    return this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  // A value that does not fit its setting (see isValidSettingValue) reads as
  // the setting's default.
  async getValue(key: SystemSettingKey): Promise<string> {
    const cacheKey = this.cacheKey(key);
    const cached = await this.cache.get<string>(cacheKey);
    if (isValidSettingValue(key, cached)) {
      return cached as string;
    }

    await this.ensureDefaultsOnce();
    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
    });
    const fallback =
      SYSTEM_SETTING_DEFAULTS.find((s) => s.key === key)?.value ?? 'false';
    const value = isValidSettingValue(key, row?.value)
      ? (row?.value as string)
      : fallback;

    await this.cache.set(cacheKey, value, SYSTEM_SETTING_CACHE_TTL_MS);
    return value;
  }

  async isEnabled(key: SystemSettingKey): Promise<boolean> {
    return (await this.getValue(key)) === 'true';
  }

  /** A setting that is a count, as a whole number within its range. */
  async getNumber(key: SystemSettingKey): Promise<number> {
    return Number(await this.getValue(key));
  }

  async invalidateAll(): Promise<void> {
    await Promise.all(
      SYSTEM_SETTING_DEFAULTS.map((s) => this.cache.del(this.cacheKey(s.key))),
    );
    this.logger.debug('System settings cache invalidated');
  }

  private cacheKey(key: string) {
    return `system_setting:${key}`;
  }
}
