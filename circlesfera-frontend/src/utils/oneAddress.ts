// The web app has one address, circlesfera.com: the server moves a page asked
// on www there, but a browser that installed the app on www opens its pages
// from the service worker without asking the server. Such a page moves itself.
const WWW_HOST = 'www.circlesfera.com';
const ONE_ORIGIN = 'https://circlesfera.com';

type PageLocation = Pick<
  Location,
  'hostname' | 'pathname' | 'search' | 'hash' | 'replace'
>;

// The address the page should be on, or null when it already is.
export function oneAddressFor(location: PageLocation): string | null {
  if (location.hostname !== WWW_HOST) return null;
  return `${ONE_ORIGIN}${location.pathname}${location.search}${location.hash}`;
}

// Moves the page to circlesfera.com when it was opened on www. Returns true
// when it does, so the app does not start on the address it is leaving.
export function moveToOneAddress(location: PageLocation = window.location) {
  const target = oneAddressFor(location);
  if (!target) return false;
  location.replace(target);
  return true;
}
