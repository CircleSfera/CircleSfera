import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AbuseHashService } from './abuse-hash.service.js';

export type AbuseRequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
  visitorId?: string | null;
  country?: string | null;
  // Secret that lets the post-deploy smoke check skip Turnstile.
  turnstileBypassToken?: string | null;
};

// Header carrying the post-deploy smoke check's Turnstile bypass token.
export const TURNSTILE_BYPASS_HEADER = 'x-turnstile-bypass';

// Normalize client IP for storage (IPv4 / IPv6). Rejects garbage; max 45 chars.
export function normalizeIp(raw?: string | null): string | null {
  if (!raw) return null;
  const ip = raw.trim().replace(/^\[|\]$/g, '');
  if (!ip || ip.length > 45) return null;
  // Basic shape check — not a full RFC parser.
  const v4 =
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every((o) => {
      const n = Number(o);
      return n >= 0 && n <= 255;
    });
  const v6 = /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':');
  if (!v4 && !v6) return null;
  return ip;
}

@Injectable()
export class DeviceSignalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abuseHash: AbuseHashService,
  ) {}

  async recordSignup(userId: string, meta: AbuseRequestMeta): Promise<void> {
    const signupIp = normalizeIp(meta.ip);
    const signupIpHash = this.abuseHash.hash(signupIp ?? meta.ip);
    const lastIpHash = signupIpHash;
    const signupCountry = normalizeCountry(meta.country);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(signupIp && { signupIp, lastIp: signupIp, lastIpAt: new Date() }),
        ...(signupIpHash && { signupIpHash, lastIpHash }),
        ...(signupCountry && { signupCountry }),
      },
    });
    await this.upsertDevice(userId, meta);
  }

  async recordLogin(userId: string, meta: AbuseRequestMeta): Promise<void> {
    const lastIp = normalizeIp(meta.ip);
    const lastIpHash = this.abuseHash.hash(lastIp ?? meta.ip);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(lastIp && { lastIp, lastIpAt: new Date() }),
        ...(lastIpHash && { lastIpHash }),
      },
    });
    await this.upsertDevice(userId, meta);
  }

  private async upsertDevice(
    userId: string,
    meta: AbuseRequestMeta,
  ): Promise<void> {
    const visitorHash = this.abuseHash.hash(meta.visitorId);
    if (!visitorHash) return;
    const userAgentHash = this.abuseHash.hash(meta.userAgent);
    await this.prisma.deviceSignal.upsert({
      where: {
        userId_visitorHash: { userId, visitorHash },
      },
      create: {
        userId,
        visitorHash,
        userAgentHash,
      },
      update: {
        lastSeenAt: new Date(),
        ...(userAgentHash && { userAgentHash }),
      },
    });
  }
}

export function normalizeCountry(raw?: string | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null;
  return code;
}

// Client IP as resolved by Express from the trusted proxy chain ('trust
// proxy' in main.ts). Never read X-Forwarded-For directly: its first entry is
// whatever the client sent.
export function clientIp(req: { ip?: string | null }): string | null {
  return normalizeIp(req.ip?.replace(/^::ffff:/, '') ?? null);
}

// Abuse signals of a sign-in or sign-up request.
export function requestAbuseMeta(req: {
  ip?: string | null;
  headers: Record<string, string | string[] | undefined>;
}): AbuseRequestMeta {
  const userAgent = req.headers['user-agent'];
  const bypass = req.headers[TURNSTILE_BYPASS_HEADER];
  return {
    ip: clientIp(req),
    userAgent: typeof userAgent === 'string' ? userAgent : null,
    country: countryFromHeaders(req.headers),
    turnstileBypassToken: typeof bypass === 'string' ? bypass : null,
  };
}

export function countryFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers['cf-ipcountry'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return normalizeCountry(value);
}
