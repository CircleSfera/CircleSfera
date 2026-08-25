import { ApiErrorCode } from '@circlesfera/shared';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { SYSTEM_SETTING_KEYS } from '../../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../../system-settings/system-settings.service.js';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const COUNTER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const TURNSTILE_FAIL_CACHE_KEY = 'trust:turnstile_fail';
export const EMAIL_FORBIDDEN_CACHE_KEY = 'trust:email_forbidden';

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SystemSettingsService)
    private readonly systemSettings: SystemSettingsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async isRequired(): Promise<boolean> {
    const enabled = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.TURNSTILE_REQUIRED,
    );
    if (!enabled) return false;
    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (secret) return true;
    if (this.config.get('NODE_ENV') === 'production') {
      throw new Error(
        'SECURITY ALERT: TURNSTILE_SECRET_KEY is required in production when turnstile_required is on.',
      );
    }
    this.logger.warn(
      'Turnstile required but TURNSTILE_SECRET_KEY is unset; skipping verification outside production.',
    );
    return false;
  }

  async assertValid(
    token: string | undefined,
    remoteIp?: string | null,
  ): Promise<void> {
    if (!(await this.isRequired())) return;

    if (!token?.trim()) {
      await this.increment(TURNSTILE_FAIL_CACHE_KEY);
      throw new BadRequestException(ApiErrorCode.CAPTCHA_REQUIRED);
    }

    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret) {
      throw new BadRequestException(ApiErrorCode.CAPTCHA_FAILED);
    }

    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token.trim());
    if (remoteIp) body.set('remoteip', remoteIp);

    let ok = false;
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json = (await res.json()) as { success?: boolean };
      ok = json.success === true;
    } catch (err) {
      this.logger.warn(
        `Turnstile siteverify failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      ok = false;
    }

    if (!ok) {
      await this.increment(TURNSTILE_FAIL_CACHE_KEY);
      throw new BadRequestException(ApiErrorCode.CAPTCHA_FAILED);
    }
  }

  async incrementEmailForbidden(): Promise<void> {
    await this.increment(EMAIL_FORBIDDEN_CACHE_KEY);
  }

  async getFunnelCounters(): Promise<{
    turnstileFailures: number;
    emailForbidden: number;
  }> {
    return {
      turnstileFailures: await this.readCounter(TURNSTILE_FAIL_CACHE_KEY),
      emailForbidden: await this.readCounter(EMAIL_FORBIDDEN_CACHE_KEY),
    };
  }

  private async increment(key: string): Promise<void> {
    const current = await this.readCounter(key);
    await this.cache.set(key, current + 1, COUNTER_TTL_MS);
  }

  private async readCounter(key: string): Promise<number> {
    const raw = await this.cache.get<number | string>(key);
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
}
