import * as net from 'node:net';
import { BadRequestException } from '@nestjs/common';

/** Limits of a link on a story. */
export const LINK_LIMITS = {
  urlMax: 2048,
  labelMax: 30,
  /** Links a profile adds in a day. */
  perDay: 10,
} as const;

/** Names that only mean something inside a network. */
const LOCAL_SUFFIXES = [
  'localhost',
  'local',
  'internal',
  'lan',
  'home',
  'home.arpa',
  'corp',
  'intranet',
  'test',
  'invalid',
  'example',
];

const refuse = (code: string): never => {
  throw new BadRequestException(code);
};

/**
 * A link as the server keeps it: https, no user name or password, the usual
 * port, a domain name with a dot that is not a name of a local network, and
 * the host as the URL standard writes it (lower case, punycode).
 */
export function normaliseLink(raw: unknown): { url: string; domain: string } {
  if (typeof raw !== 'string') return refuse('LINK_INVALID');
  const text = raw.trim();
  if (!text || text.length > LINK_LIMITS.urlMax) return refuse('LINK_INVALID');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return refuse('LINK_INVALID');
  }
  if (url.protocol !== 'https:') refuse('LINK_HTTPS_ONLY');
  if (url.username || url.password) refuse('LINK_INVALID');
  if (url.port && url.port !== '443') refuse('LINK_INVALID');
  const host = url.hostname.replace(/\.$/, '');
  if (net.isIP(host.replace(/^\[|\]$/g, ''))) refuse('LINK_IP_NOT_ALLOWED');
  if (!host.includes('.')) refuse('LINK_HOST_NOT_ALLOWED');
  if (
    LOCAL_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    )
  ) {
    refuse('LINK_HOST_NOT_ALLOWED');
  }
  url.hostname = host;
  return { url: url.href, domain: host };
}

/** A domain and every domain it is under: a.b.example.com → …, example.com. */
export function domainSuffixes(host: string): string[] {
  const labels = host.toLowerCase().split('.');
  return labels.slice(0, -1).map((_, i) => labels.slice(i).join('.'));
}

/** Whether a host is a blocked domain or under one. */
export function isUnderBlocked(host: string, blocked: ReadonlySet<string>) {
  return domainSuffixes(host).some((d) => blocked.has(d));
}
