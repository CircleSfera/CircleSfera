// Detect Admin Panel host.
// Production: admin.circlesfera.com
// Local override: VITE_ADMIN_PANEL_HOST
// Also treat hostname starting with "admin."
export function isAdminPanelHost(
  hostname: string = typeof window !== 'undefined'
    ? window.location.hostname
    : '',
): boolean {
  const configured = import.meta.env.VITE_ADMIN_PANEL_HOST as
    | string
    | undefined;
  if (configured && hostname === configured) return true;
  if (hostname === 'admin.circlesfera.com') return true;
  if (hostname.startsWith('admin.')) return true;
  // Local dev convenience: open SPA as Admin Panel when flag set
  if (
    import.meta.env.VITE_ADMIN_PANEL === 'true' &&
    (hostname === 'localhost' || hostname === '127.0.0.1')
  ) {
    return true;
  }
  return false;
}

// Detect the Backoffice host: the staff site that runs the business.
// Production: backoffice.circlesfera.com
// Local override: VITE_BACKOFFICE_HOST, or VITE_BACKOFFICE=true on localhost
// Also treat hostname starting with "backoffice."
export function isBackofficeHost(
  hostname: string = typeof window !== 'undefined'
    ? window.location.hostname
    : '',
): boolean {
  const configured = import.meta.env.VITE_BACKOFFICE_HOST as string | undefined;
  if (configured && hostname === configured) return true;
  if (hostname === 'backoffice.circlesfera.com') return true;
  if (hostname.startsWith('backoffice.')) return true;
  if (
    import.meta.env.VITE_BACKOFFICE === 'true' &&
    (hostname === 'localhost' || hostname === '127.0.0.1')
  ) {
    return true;
  }
  return false;
}

// A staff host: the Admin Panel or the Backoffice. Both are opened with the
// staff session, never with a participant one. The session of one site does
// not open the other: its cookies and its stored state belong to the host.
export function isStaffHost(hostname?: string): boolean {
  return isAdminPanelHost(hostname) || isBackofficeHost(hostname);
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost')
  );
}

export function adminPanelOrigin(): string {
  if (typeof window !== 'undefined' && isAdminPanelHost()) {
    return window.location.origin;
  }

  const configured = import.meta.env.VITE_ADMIN_PANEL_HOST as
    | string
    | undefined;
  if (configured) {
    if (isLocalHostname(configured)) {
      const port =
        typeof window !== 'undefined' && window.location.port
          ? window.location.port
          : '5173';
      return `http://${configured}${port ? `:${port}` : ''}`;
    }
    return `https://${configured}`;
  }

  if (
    typeof window !== 'undefined' &&
    isLocalHostname(window.location.hostname)
  ) {
    const { protocol, port } = window.location;
    return `${protocol}//admin.localhost${port ? `:${port}` : ''}`;
  }

  return 'https://admin.circlesfera.com';
}

export function platformOrigin(): string {
  if (typeof window === 'undefined') return 'https://circlesfera.com';
  if (!isStaffHost()) return window.location.origin;
  if (isLocalHostname(window.location.hostname)) {
    const { protocol, port } = window.location;
    return `${protocol}//localhost${port ? `:${port}` : ''}`;
  }
  return 'https://circlesfera.com';
}
