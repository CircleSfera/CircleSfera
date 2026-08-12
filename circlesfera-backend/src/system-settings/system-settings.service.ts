import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service.js';
import {
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

  /** Insert missing catalog rows without overwriting existing values. */
  async ensureDefaults(updatedBy = 'system'): Promise<void> {
    for (const setting of SYSTEM_SETTING_DEFAULTS) {
      const existing = await this.prisma.systemSetting.findUnique({
        where: { key: setting.key },
      });
      if (!existing) {
        await this.prisma.systemSetting.create({
          data: {
            key: setting.key,
            value: setting.value,
            description: setting.description,
            updatedBy,
          },
        });
      }
    }
  }

  async list() {
    await this.ensureDefaults();
    return this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async getValue(key: SystemSettingKey): Promise<string> {
    const cacheKey = this.cacheKey(key);
    const cached = await this.cache.get<string>(cacheKey);
    if (cached === 'true' || cached === 'false') {
      return cached;
    }

    await this.ensureDefaults();
    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
    });
    const fallback =
      SYSTEM_SETTING_DEFAULTS.find((s) => s.key === key)?.value ?? 'false';
    const value =
      row?.value === 'true' || row?.value === 'false' ? row.value : fallback;

    await this.cache.set(cacheKey, value, SYSTEM_SETTING_CACHE_TTL_MS);
    return value;
  }

  async isEnabled(key: SystemSettingKey): Promise<boolean> {
    return (await this.getValue(key)) === 'true';
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
