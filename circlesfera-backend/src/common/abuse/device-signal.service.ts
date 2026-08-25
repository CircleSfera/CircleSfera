import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AbuseHashService } from './abuse-hash.service.js';

export type AbuseRequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
  visitorId?: string | null;
  country?: string | null;
};

/** Normalize client IP for storage (IPv4 / IPv6). Rejects garbage; max 45 chars. */
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
        ...(signupIp && { signupIp, lastIp: signupIp }),
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
        ...(lastIp && { lastIp }),
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

export function clientIpFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  fallback?: string | null,
): string | null {
  const xf = headers['x-forwarded-for'];
  const first =
    typeof xf === 'string'
      ? xf.split(',')[0]?.trim()
      : Array.isArray(xf)
        ? xf[0]
        : '';
  return normalizeIp(first || fallback || null);
}

export function countryFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers['cf-ipcountry'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return normalizeCountry(value);
}
