// Errors are reported only from the app's own addresses: a copy of the site
// served from another domain must not fill CircleSfera's reports.
const OWN_HOSTS = ['circlesfera.com', 'localhost', '127.0.0.1'];

export function isOwnHost(hostname: string): boolean {
  return OWN_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}
