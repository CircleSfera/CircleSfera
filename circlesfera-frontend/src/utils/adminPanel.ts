/**
 * Detect Admin Panel host.
 * Production: admin.circlesfera.com
 * Local override: VITE_ADMIN_PANEL_HOST —
 * also treat hostname starting with "admin."
 */
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
  if (!isAdminPanelHost()) return window.location.origin;
  if (isLocalHostname(window.location.hostname)) {
    const { protocol, port } = window.location;
    return `${protocol}//localhost${port ? `:${port}` : ''}`;
  }
  return 'https://circlesfera.com';
}
