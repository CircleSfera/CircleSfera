import * as crypto from 'node:crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { FeatureFlag } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ExperimentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Deterministic hash function to map a string (like userId) to an integer between 0 and 99.
   */
  private getHashForUser(userId: string, salt: string): number {
    const hash = crypto
      .createHash('md5')
      .update(`${userId}-${salt}`)
      .digest('hex');
    const intValue = parseInt(hash.substring(0, 8), 16);
    return intValue % 100;
  }

  async isFeatureEnabled(
    key: string,
    userId?: string | null,
  ): Promise<boolean> {
    // 1. Check UserExperiment explicit override first
    if (userId) {
      const userExp = await this.prisma.userExperiment.findUnique({
        where: { userId_experimentKey: { userId, experimentKey: key } },
      });
      if (userExp) {
        const variant = userExp.variant.toLowerCase();
        if (['true', 'treatment', 'on', '1'].includes(variant)) return true;
        if (['false', 'control', 'off', '0'].includes(variant)) return false;
      }
    }

    // 2. Fallback to FeatureFlag percentage
    const cacheKey = `feature_flag:${key}`;
    let flag = await this.cacheManager.get<{
      isEnabled: boolean;
      percentage: number;
    }>(cacheKey);

    if (!flag) {
      const dbFlag = await this.prisma.featureFlag.findUnique({
        where: { key },
      });
      if (dbFlag) {
        flag = { isEnabled: dbFlag.isEnabled, percentage: dbFlag.percentage };
        // Cache for 5 minutes
        await this.cacheManager.set(cacheKey, flag, 300000);
      } else {
        return false;
      }
    }

    if (!flag.isEnabled) return false;
    if (flag.percentage === 100) return true;
    if (flag.percentage === 0) return false;

    if (!userId) return false;

    const hashValue = this.getHashForUser(userId, key);
    return hashValue < flag.percentage;
  }

  async getMyFlags(userId: string | null): Promise<Record<string, boolean>> {
    const flags = await this.prisma.featureFlag.findMany();
    const result: Record<string, boolean> = {};

    // Get all user overrides at once
    const userOverrides: Record<string, boolean> = {};
    if (userId) {
      const exps = await this.prisma.userExperiment.findMany({
        where: { userId },
      });
      for (const exp of exps) {
        const variant = exp.variant.toLowerCase();
        if (['true', 'treatment', 'on', '1'].includes(variant)) {
          userOverrides[exp.experimentKey] = true;
        } else if (['false', 'control', 'off', '0'].includes(variant)) {
          userOverrides[exp.experimentKey] = false;
        }
      }
    }

    for (const flag of flags) {
      // 1. UserExperiment explicit override takes precedence
      if (userId && userOverrides[flag.key] !== undefined) {
        result[flag.key] = userOverrides[flag.key];
        continue;
      }

      // 2. Fallback to FeatureFlag logic
      if (!flag.isEnabled) {
        result[flag.key] = false;
        continue;
      }
      if (flag.percentage === 100) {
        result[flag.key] = true;
        continue;
      }
      if (flag.percentage === 0) {
        result[flag.key] = false;
        continue;
      }

      if (!userId) {
        result[flag.key] = false;
      } else {
        const hashValue = this.getHashForUser(userId, flag.key);
        result[flag.key] = hashValue < flag.percentage;
      }
    }

    return result;
  }

  async setFlag(key: string, data: Partial<FeatureFlag>) {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: data,
      create: {
        key,
        name: data.name || key,
        description: data.description,
        isEnabled: data.isEnabled ?? false,
        percentage: data.percentage ?? 0,
      },
    });

    // Invalidate cache
    await this.cacheManager.del(`feature_flag:${key}`);
    return flag;
  }
}
