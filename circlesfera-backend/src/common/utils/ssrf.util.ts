import * as dns from 'node:dns';
import * as net from 'node:net';

/**
 * Custom error thrown when a URL or resolved IP violates SSRF restrictions.
 */
export class SsrfBlockedError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/**
 * Represents an IPv4 CIDR range as [networkInteger, maskInteger].
 */
type Ipv4Cidr = [number, number];

/**
 * Parses an IPv4 CIDR string into [networkNumber, maskNumber].
 */
function parseIpv4Cidr(cidr: string): Ipv4Cidr {
  const [ipPart, prefixPart] = cidr.split('/');
  const prefix = Number.parseInt(prefixPart ?? '32', 10);
  const octets = ipPart.split('.').map((o) => Number.parseInt(o, 10));
  const ipNum = (((octets[0] << 24) |
    (octets[1] << 16) |
    (octets[2] << 8) |
    octets[3]) >>>
    0) as number;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return [ipNum & mask, mask];
}

/**
 * Converts a dotted-quad IPv4 string to an unsigned 32-bit integer.
 */
function ipv4ToNumber(ip: string): number {
  const octets = ip.split('.').map((o) => Number.parseInt(o, 10));
  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

/**
 * Private and reserved IPv4 CIDR ranges per RFC 6890 / IANA.
 */
const PRIVATE_IPV4_RANGES: Ipv4Cidr[] = [
  parseIpv4Cidr('0.0.0.0/8'), // This host on this network (RFC 1122)
  parseIpv4Cidr('10.0.0.0/8'), // Private-Use (RFC 1918)
  parseIpv4Cidr('100.64.0.0/10'), // Shared Address Space / CGNAT (RFC 6598)
  parseIpv4Cidr('127.0.0.0/8'), // Loopback (RFC 1122)
  parseIpv4Cidr('169.254.0.0/16'), // Link-Local / Cloud Metadata (RFC 3927)
  parseIpv4Cidr('172.16.0.0/12'), // Private-Use (RFC 1918)
  parseIpv4Cidr('192.0.0.0/24'), // IETF Protocol Assignments (RFC 6890)
  parseIpv4Cidr('192.0.2.0/24'), // Documentation TEST-NET-1 (RFC 5737)
  parseIpv4Cidr('192.88.99.0/24'), // 6to4 Relay Anycast (RFC 7526)
  parseIpv4Cidr('192.168.0.0/16'), // Private-Use (RFC 1918)
  parseIpv4Cidr('198.18.0.0/15'), // Benchmarking (RFC 2544)
  parseIpv4Cidr('198.51.100.0/24'), // Documentation TEST-NET-2 (RFC 5737)
  parseIpv4Cidr('203.0.113.0/24'), // Documentation TEST-NET-3 (RFC 5737)
  parseIpv4Cidr('224.0.0.0/4'), // Multicast (RFC 5771)
  parseIpv4Cidr('240.0.0.0/4'), // Reserved for Future Use (RFC 1112)
  parseIpv4Cidr('255.255.255.255/32'), // Limited Broadcast (RFC 919)
];

/**
 * Checks if an IPv4 address falls within any private or reserved range.
 */
function isPrivateIpv4(ip: string): boolean {
  const ipNum = ipv4ToNumber(ip);
  for (const [netNum, mask] of PRIVATE_IPV4_RANGES) {
    if ((ipNum & mask) === netNum) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if an IPv6 address falls within any private or reserved range.
 */
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // Unspecified & loopback
  if (lower === '::' || lower === '::1' || lower === '0:0:0:0:0:0:0:1') {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:192.0.2.1 or ::ffff:c000:0201)
  if (lower.startsWith('::ffff:')) {
    const rest = lower.slice('::ffff:'.length);
    if (net.isIP(rest) === 4) {
      return isPrivateIpv4(rest);
    }
    // Hex format ::ffff:xxxx:xxxx
    const parts = rest.split(':');
    if (parts.length === 2) {
      const p1 = Number.parseInt(parts[0], 16);
      const p2 = Number.parseInt(parts[1], 16);
      if (!Number.isNaN(p1) && !Number.isNaN(p2)) {
        const extractedIpv4 = `${(p1 >> 8) & 0xff}.${p1 & 0xff}.${(p2 >> 8) & 0xff}.${p2 & 0xff}`;
        return isPrivateIpv4(extractedIpv4);
      }
    }
    return true;
  }

  // Unique Local Address (ULA): fc00::/7 (fc00:: to fdff::)
  if (
    /^f[cd][0-9a-f]{2}:/i.test(lower) ||
    lower.startsWith('fc') ||
    lower.startsWith('fd')
  ) {
    return true;
  }

  // Link-Local Unicast: fe80::/10 (fe80:: to febf::)
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) {
    return true;
  }

  // Multicast: ff00::/8
  if (lower.startsWith('ff')) {
    return true;
  }

  // Discard prefix (100::/64)
  if (lower.startsWith('100:')) {
    return true;
  }

  // Documentation (2001:db8::/32)
  if (lower.startsWith('2001:db8:') || lower.startsWith('2001:0db8:')) {
    return true;
  }

  return false;
}

/**
 * Returns true if an IP (IPv4 or IPv6) is a private, loopback, link-local,
 * or reserved address that should never be accessed via user-controlled fetch.
 */
export function isPrivateIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateIpv4(ip);
  }
  if (version === 6) {
    return isPrivateIpv6(ip);
  }
  // Unknown or invalid IP format — treat as unsafe
  return true;
}

/**
 * Synchronously checks whether a hostname (IP or domain name) is obviously
 * private, local, or loopback without performing async DNS resolution.
 */
export function isPrivateOrLocalHost(hostname: string): boolean {
  // If it's an IP literal, evaluate via isPrivateIp
  const version = net.isIP(hostname);
  if (version !== 0) {
    return isPrivateIp(hostname);
  }

  // Check forbidden local/internal patterns
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  // Single-label hostnames without dots (e.g., "metadata", "redis", "database")
  if (!hostname.includes('.')) {
    return true;
  }

  return false;
}

/**
 * Options for validating a target URL against SSRF rules.
 */
export interface ValidateUrlOptions {
  /** Enforce HTTPS only (defaults to true in production) */
  requireHttps?: boolean;
  /** Allowed TCP destination ports (default: [80, 443]) */
  allowedPorts?: number[];
  /** Optional explicit domain allowlist (e.g. ['s3.amazonaws.com', 'res.cloudinary.com']) */
  allowedDomains?: string[];
  /** Custom DNS resolver function for testing */
  dnsLookup?: typeof dns.promises.lookup;
}

/**
 * Blocked hostname suffixes/patterns that should never be reached.
 */
const FORBIDDEN_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.corp$/i,
  /\.lan$/i,
  /\.home$/i,
  /\.intranet$/i,
];

/**
 * Validates a target URL string against SSRF rules.
 * Resolves the hostname and ensures none of the resulting IP addresses
 * point to private, loopback, or cloud-metadata destinations.
 *
 * @throws {SsrfBlockedError} on any SSRF rule violation.
 */
export async function validateTargetUrl(
  rawUrl: string,
  options: ValidateUrlOptions = {},
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(
      `Invalid URL format: "${rawUrl}"`,
      'MALFORMED_URL',
    );
  }

  const {
    requireHttps = process.env.NODE_ENV === 'production',
    allowedPorts = [80, 443],
    allowedDomains,
    dnsLookup = dns.promises.lookup,
  } = options;

  // 1. Protocol check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(
      `Forbidden protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`,
      'FORBIDDEN_PROTOCOL',
    );
  }

  if (requireHttps && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(
      'HTTPS is required for external media retrieval.',
      'HTTPS_REQUIRED',
    );
  }

  // 2. Port check
  const port = parsed.port
    ? Number.parseInt(parsed.port, 10)
    : parsed.protocol === 'https:'
      ? 443
      : 80;

  if (!allowedPorts.includes(port)) {
    throw new SsrfBlockedError(
      `Destination port ${port} is not permitted. Allowed ports: ${allowedPorts.join(', ')}.`,
      'FORBIDDEN_PORT',
    );
  }

  const hostname = parsed.hostname;

  // 3. Domain allowlist check (if specified)
  if (allowedDomains && allowedDomains.length > 0) {
    const isDomainAllowed = allowedDomains.some((d) => {
      const cleanDomain = d.toLowerCase();
      const cleanHost = hostname.toLowerCase();
      return cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`);
    });

    if (!isDomainAllowed) {
      throw new SsrfBlockedError(
        `Domain "${hostname}" is not in the allowed domains list.`,
        'DOMAIN_NOT_ALLOWED',
      );
    }
  }

  // 4. Blocked hostname pattern check
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new SsrfBlockedError(
        `Target hostname "${hostname}" is a local or internal domain name.`,
        'FORBIDDEN_HOSTNAME',
      );
    }
  }

  // Single-label hostnames without dots (e.g., "metadata", "redis", "database") are internal
  if (!hostname.includes('.') && !net.isIP(hostname)) {
    throw new SsrfBlockedError(
      `Target hostname "${hostname}" has no domain suffix and is treated as internal.`,
      'INTERNAL_HOSTNAME',
    );
  }

  // 5. IP Address check
  const ipVersion = net.isIP(hostname);
  if (ipVersion !== 0) {
    if (isPrivateIp(hostname)) {
      throw new SsrfBlockedError(
        `Target IP "${hostname}" is in a private, loopback, or reserved address space.`,
        'PRIVATE_IP',
      );
    }
    return parsed;
  }

  // 6. DNS resolution check (anti-SSRF DNS verification)
  try {
    const results = await dnsLookup(hostname, { all: true });
    if (!results || results.length === 0) {
      throw new SsrfBlockedError(
        `Hostname "${hostname}" could not be resolved.`,
        'DNS_RESOLUTION_FAILED',
      );
    }

    for (const record of results) {
      if (isPrivateIp(record.address)) {
        throw new SsrfBlockedError(
          `Hostname "${hostname}" resolved to private IP "${record.address}".`,
          'PRIVATE_IP_RESOLVED',
        );
      }
    }
  } catch (error: unknown) {
    if (error instanceof SsrfBlockedError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new SsrfBlockedError(
      `Failed to resolve DNS for "${hostname}": ${msg}`,
      'DNS_LOOKUP_ERROR',
    );
  }

  return parsed;
}
