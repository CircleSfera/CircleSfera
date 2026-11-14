import { promises as dns } from 'node:dns';
import { safeFetchMedia } from '../common/utils/safe-media-fetcher.js';
import {
  DOMAIN_META_NAME,
  DOMAIN_TXT_PREFIX,
  HOME_PAGE_MAX_BYTES,
  HOME_PAGE_TIMEOUT_MS,
  VIES_ES_URL,
  VIES_TIMEOUT_MS,
} from './company-verification.constants.js';

// Whether a TXT record of the domain carries the application's code. A
// domain that cannot be resolved has none.
export async function hasDnsProof(
  domain: string,
  token: string,
  resolveTxt: (name: string) => Promise<string[][]> = dns.resolveTxt,
): Promise<boolean> {
  const records = await resolveTxt(domain).catch(() => [] as string[][]);
  return records.some(
    (chunks) => chunks.join('').trim() === `${DOMAIN_TXT_PREFIX}${token}`,
  );
}

// Whether the home page of the domain, or of www. on it, has the meta tag
// with the code in its head. Each is read over HTTPS from a public address
// only, bounded in size and time, and without following a redirect: a tag
// on another host proves nothing about this domain. A page that cannot be
// read has none.
export async function hasMetaProof(
  domain: string,
  token: string,
  fetchPage: typeof safeFetchMedia = safeFetchMedia,
): Promise<boolean> {
  for (const host of [domain, `www.${domain}`]) {
    try {
      const page = await fetchPage(`https://${host}/`, {
        requireHttps: true,
        allowedPorts: [443],
        maxBytes: HOME_PAGE_MAX_BYTES,
        timeoutMs: HOME_PAGE_TIMEOUT_MS,
        maxRedirects: 0,
        // An HTML page has no file signature to check.
        allowedMimeTypes: [],
      });
      if (headHasTag(page.buffer.toString('utf8'), token)) return true;
    } catch {
      // Not readable: the next host, or none.
    }
  }
  return false;
}

// The meta tag in the page's head, not in a comment or a script.
function headHasTag(html: string, token: string): boolean {
  const head = html
    .split(/<\/head\s*>|<body\b/i)[0]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\bname\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (name?.trim() === DOMAIN_META_NAME && content?.trim() === token) {
      return true;
    }
  }
  return false;
}

export type ViesAnswer = { valid: boolean; name: string | null };

// What VIES says of a Spanish tax ID, or null when it could not be asked.
// VIES helps and never blocks: a null or a "not valid" answer only means
// staff check the documents without it.
export async function askVies(
  taxId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ViesAnswer | null> {
  try {
    const response = await fetchImpl(
      `${VIES_ES_URL}/${encodeURIComponent(taxId)}`,
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(VIES_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      isValid?: unknown;
      name?: unknown;
      userError?: unknown;
    };
    if (typeof body.isValid !== 'boolean') return null;
    // A national service that is down is reported as "not valid" with an
    // error: that is no answer at all.
    if (
      typeof body.userError === 'string' &&
      body.userError !== 'VALID' &&
      body.userError !== 'INVALID'
    ) {
      return null;
    }
    const name =
      typeof body.name === 'string' && body.name.trim() && body.name !== '---'
        ? body.name.trim()
        : null;
    return { valid: body.isValid, name };
  } catch {
    return null;
  }
}
