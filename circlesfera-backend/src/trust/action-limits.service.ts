import { ErrorCode } from '@circlesfera/shared';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AbuseHashService } from '../common/abuse/abuse-hash.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ACTION_WINDOWS,
  type ActionWindow,
  type LimitedAction,
  MIN_FINGERPRINT_TEXT_LENGTH,
  NEW_ACCOUNT_DAYS,
  RESTRICTED_DAILY_LIMITS,
  SAME_TEXT_ACROSS_PROFILES,
  SAME_TEXT_BY_PROFILE,
  VELOCITY_THRESHOLDS,
} from './trust.constants.js';
import { TRUST_REDIS } from './trust-redis.provider.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TEXT_PROFILE_TTL_S = 24 * 60 * 60;
const TEXT_GLOBAL_TTL_S = 60 * 60;
const SIGNAL_TTL_S = 24 * 60 * 60;
const ACTIVE_SET_TTL_S = 2 * 24 * 60 * 60;

export const trustKeys = {
  counter: (
    action: LimitedAction,
    w: ActionWindow,
    profileId: string,
    bucket: number,
  ) => `trust:lim:${action}:${w.name}:${profileId}:${bucket}`,
  restricted: (profileId: string) => `trust:restricted:${profileId}`,
  writesToday: (profileId: string, day: number) =>
    `trust:writes:${profileId}:${day}`,
  active: (day: number) => `trust:active:${day}`,
  textByProfile: (profileId: string, hash: string) =>
    `trust:txt:p:${profileId}:${hash}`,
  textAcrossProfiles: (hash: string) => `trust:txt:g:${hash}`,
  repeatedSignal: (profileId: string) => `trust:sig:repeat:${profileId}`,
  coordinatedSignal: (profileId: string) => `trust:sig:coord:${profileId}`,
  evaluationLock: (profileId: string) => `trust:eval:${profileId}`,
};

export function dayNumber(at: Date = new Date()): number {
  return Math.floor(at.getTime() / DAY_MS);
}

// Callback the detector registers to be told that a Profile crossed a
// velocity or repeated-text threshold.
export type EvaluationTrigger = (profileId: string) => void;

// Per-Profile caps on follows, message requests and comments, and the
// behavioural counters the detector reads. Counters live in Redis with fixed
// windows. When Redis is unavailable the caps fail open (the action goes
// ahead): they protect against spam, not against unauthorized access, and
// the global request throttling still applies.
@Injectable()
export class ActionLimitsService {
  private readonly logger = new Logger(ActionLimitsService.name);
  private trigger: EvaluationTrigger | null = null;

  constructor(
    @Inject(TRUST_REDIS) private readonly redis: Redis,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AbuseHashService) private readonly abuseHash: AbuseHashService,
  ) {}

  onEvaluationNeeded(trigger: EvaluationTrigger): void {
    this.trigger = trigger;
  }

  // Counts one action and refuses it when a cap is exceeded. Call before
  // the action is written.
  async consume(profileId: string, action: LimitedAction): Promise<void> {
    const now = new Date();
    let counts: number[];
    const windows = ACTION_WINDOWS[action];
    const keys = windows.map((w) =>
      trustKeys.counter(
        action,
        w,
        profileId,
        Math.floor(now.getTime() / 1000 / w.seconds),
      ),
    );
    try {
      const pipeline = this.redis.multi();
      windows.forEach((w, i) => {
        pipeline.incr(keys[i]);
        pipeline.expire(keys[i], w.seconds);
      });
      const results = (await pipeline.exec()) ?? [];
      counts = windows.map((_, i) => Number(results[i * 2]?.[1] ?? 0));
    } catch (error) {
      this.logger.warn(
        `Action limits unavailable, allowing ${action}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return;
    }

    const limits = await this.limitsFor(profileId, action);
    const exceeded = windows.findIndex((w, i) => {
      const limit = limits.get(w.name);
      return limit !== undefined && counts[i] > limit;
    });
    if (exceeded >= 0) {
      // The refused action must not count.
      await Promise.all(keys.map((k) => this.redis.decr(k))).catch(() => {});
      const w = windows[exceeded];
      const bucketEnd =
        (Math.floor(now.getTime() / 1000 / w.seconds) + 1) * w.seconds * 1000;
      throw new AppException(
        ErrorCode.ACTION_LIMIT_REACHED,
        HttpStatus.TOO_MANY_REQUESTS,
        `Limit reached for ${action.replace('_', ' ')}s`,
        { action, retryAt: new Date(bucketEnd).toISOString() },
      );
    }

    await this.trackWrite(profileId);
    const velocity = VELOCITY_THRESHOLDS[action];
    const vIndex = windows.findIndex((w) => w.name === velocity.window);
    if (vIndex >= 0 && counts[vIndex] > velocity.over) {
      this.trigger?.(profileId);
    }
  }

  // Counts a write that has no cap (posts, messages) for the "new and very
  // active" signal and marks the Profile for the nightly evaluation.
  async trackWrite(profileId: string): Promise<void> {
    const day = dayNumber();
    try {
      await this.redis
        .multi()
        .incr(trustKeys.writesToday(profileId, day))
        .expire(trustKeys.writesToday(profileId, day), ACTIVE_SET_TTL_S)
        .sadd(trustKeys.active(day), profileId)
        .expire(trustKeys.active(day), ACTIVE_SET_TTL_S)
        .exec();
    } catch {
      // Counting is best effort.
    }
  }

  // Fingerprints a comment or an unsolicited message to spot the same text
  // sent again and again, by one Profile or by several. Only a keyed hash of
  // the normalized text is kept, for at most 24 hours; never the text.
  async recordText(profileId: string, text: string): Promise<void> {
    const normalized = text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (normalized.length < MIN_FINGERPRINT_TEXT_LENGTH) return;
    const hash = this.abuseHash.hash(normalized);
    if (!hash) return;
    try {
      const byProfileKey = trustKeys.textByProfile(profileId, hash);
      const acrossKey = trustKeys.textAcrossProfiles(hash);
      const results =
        (await this.redis
          .multi()
          .incr(byProfileKey)
          .expire(byProfileKey, TEXT_PROFILE_TTL_S)
          .sadd(acrossKey, profileId)
          .expire(acrossKey, TEXT_GLOBAL_TTL_S)
          .scard(acrossKey)
          .exec()) ?? [];
      const sameByProfile = Number(results[0]?.[1] ?? 0);
      const distinctProfiles = Number(results[4]?.[1] ?? 0);

      if (sameByProfile >= SAME_TEXT_BY_PROFILE) {
        await this.raiseSignal(
          trustKeys.repeatedSignal(profileId),
          sameByProfile,
        );
        this.trigger?.(profileId);
      }
      if (distinctProfiles >= SAME_TEXT_ACROSS_PROFILES) {
        const members = await this.redis.smembers(acrossKey);
        for (const member of members) {
          await this.raiseSignal(
            trustKeys.coordinatedSignal(member),
            distinctProfiles,
          );
          this.trigger?.(member);
        }
      }
    } catch {
      // Fingerprinting is best effort.
    }
  }

  // Values the detector reads for a Profile.
  async readSignals(profileId: string): Promise<{
    velocity: Partial<Record<LimitedAction, number>>;
    repeatedText: number;
    coordinatedText: number;
    writesToday: number;
  }> {
    const now = Date.now();
    const velocity: Partial<Record<LimitedAction, number>> = {};
    try {
      for (const action of Object.keys(
        VELOCITY_THRESHOLDS,
      ) as LimitedAction[]) {
        const w = ACTION_WINDOWS[action].find(
          (x) => x.name === VELOCITY_THRESHOLDS[action].window,
        );
        if (!w) continue;
        const value = await this.redis.get(
          trustKeys.counter(
            action,
            w,
            profileId,
            Math.floor(now / 1000 / w.seconds),
          ),
        );
        velocity[action] = Number(value ?? 0);
      }
      const [repeated, coordinated, writes] = await Promise.all([
        this.redis.get(trustKeys.repeatedSignal(profileId)),
        this.redis.get(trustKeys.coordinatedSignal(profileId)),
        this.redis.get(trustKeys.writesToday(profileId, dayNumber())),
      ]);
      return {
        velocity,
        repeatedText: Number(repeated ?? 0),
        coordinatedText: Number(coordinated ?? 0),
        writesToday: Number(writes ?? 0),
      };
    } catch {
      return { velocity, repeatedText: 0, coordinatedText: 0, writesToday: 0 };
    }
  }

  // Profiles that wrote something today or yesterday, for the nightly run.
  async recentlyActiveProfiles(): Promise<string[]> {
    const today = dayNumber();
    try {
      const [a, b] = await Promise.all([
        this.redis.smembers(trustKeys.active(today)),
        this.redis.smembers(trustKeys.active(today - 1)),
      ]);
      return [...new Set([...a, ...b])];
    } catch {
      return [];
    }
  }

  // Marks a Profile as restricted until the given time (reduced caps).
  async setRestricted(profileId: string, until: Date): Promise<void> {
    const ms = until.getTime() - Date.now();
    if (ms <= 0) return this.clearRestricted(profileId);
    await this.redis
      .set(trustKeys.restricted(profileId), until.toISOString(), 'PX', ms)
      .catch((e: unknown) => this.logger.warn(String(e)));
  }

  async clearRestricted(profileId: string): Promise<void> {
    await this.redis
      .del(trustKeys.restricted(profileId))
      .catch((e: unknown) => this.logger.warn(String(e)));
  }

  // Takes a short lock so one Profile is not evaluated many times in a row.
  async tryEvaluationLock(profileId: string, seconds = 60): Promise<boolean> {
    try {
      const ok = await this.redis.set(
        trustKeys.evaluationLock(profileId),
        '1',
        'EX',
        seconds,
        'NX',
      );
      return ok === 'OK';
    } catch {
      return false;
    }
  }

  private async raiseSignal(key: string, value: number): Promise<void> {
    const current = Number((await this.redis.get(key)) ?? 0);
    if (value > current) {
      await this.redis.set(key, String(value), 'EX', SIGNAL_TTL_S);
    }
  }

  // Caps per window for this Profile: halved for new accounts, and the
  // daily cap lowered while a protective restriction is active.
  private async limitsFor(
    profileId: string,
    action: LimitedAction,
  ): Promise<Map<string, number>> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { user: { select: { createdAt: true } } },
    });
    const createdAt = profile?.user?.createdAt;
    const isNew =
      !!createdAt &&
      Date.now() - createdAt.getTime() < NEW_ACCOUNT_DAYS * DAY_MS;

    const limits = new Map<string, number>();
    for (const w of ACTION_WINDOWS[action]) {
      if (w.limit === null) continue;
      limits.set(w.name, isNew ? Math.floor(w.limit / 2) : w.limit);
    }

    const restrictedCap = RESTRICTED_DAILY_LIMITS[action];
    if (restrictedCap !== undefined) {
      const restricted = await this.redis
        .exists(trustKeys.restricted(profileId))
        .catch(() => 0);
      if (restricted) {
        limits.set(
          '1d',
          Math.min(limits.get('1d') ?? restrictedCap, restrictedCap),
        );
      }
    }
    return limits;
  }
}
