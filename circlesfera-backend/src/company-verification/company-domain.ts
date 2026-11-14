// A company's domain as it is checked: lower case, without the scheme, the
// path, a port or a leading "www.". Null when it is not a public host name
// (an IP address, a single label, or characters a domain cannot have).
const DOMAIN_PATTERN =
  /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.split(/[/?#]/)[0];
  value = value.replace(/:\d+$/, '');
  value = value.replace(/\.$/, '');
  value = value.replace(/^www\./, '');
  if (!DOMAIN_PATTERN.test(value)) return null;
  // The last label of a public name is never all digits.
  if (/\.\d+$/.test(value)) return null;
  return value;
}

// The local part of an address on the company's domain.
export function isValidLocalPart(localPart: string): boolean {
  // No "%": some mail servers still relay "a%b@domain" to another host.
  return /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/i.test(localPart);
}
