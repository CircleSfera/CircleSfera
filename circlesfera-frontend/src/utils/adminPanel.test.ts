import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminPanelOrigin,
  backofficeOrigin,
  isAdminPanelHost,
  isBackofficeHost,
  isStaffHost,
  platformOrigin,
} from './adminPanel';

// Opens the app at an address for the helpers that read where it runs.
const at = (address: string) => {
  const url = new URL(address);
  vi.stubGlobal('location', {
    hostname: url.hostname,
    origin: url.origin,
    protocol: url.protocol,
    port: url.port,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('staff hosts', () => {
  it.each(['backoffice.circlesfera.com', 'backoffice.localhost'])(
    'recognises %s as the Backoffice',
    (host) => {
      expect(isBackofficeHost(host)).toBe(true);
      expect(isAdminPanelHost(host)).toBe(false);
      expect(isStaffHost(host)).toBe(true);
    },
  );

  it.each(['admin.circlesfera.com', 'admin.localhost'])(
    'recognises %s as the Admin Panel, not the Backoffice',
    (host) => {
      expect(isAdminPanelHost(host)).toBe(true);
      expect(isBackofficeHost(host)).toBe(false);
      expect(isStaffHost(host)).toBe(true);
    },
  );

  it.each(['circlesfera.com', 'www.circlesfera.com', 'localhost'])(
    'treats %s as the participant app',
    (host) => {
      expect(isBackofficeHost(host)).toBe(false);
      expect(isStaffHost(host)).toBe(false);
    },
  );
});

describe('staff hosts set for a deployment', () => {
  it('recognises the configured hosts, whatever their name', () => {
    vi.stubEnv('VITE_ADMIN_PANEL_HOST', 'panel.example.test');
    vi.stubEnv('VITE_BACKOFFICE_HOST', 'office.example.test');

    expect(isAdminPanelHost('panel.example.test')).toBe(true);
    expect(isBackofficeHost('panel.example.test')).toBe(false);
    expect(isBackofficeHost('office.example.test')).toBe(true);
    expect(isAdminPanelHost('office.example.test')).toBe(false);
  });

  it.each(['localhost', '127.0.0.1'])(
    'opens %s as the Admin Panel or the Backoffice only with its flag',
    (host) => {
      expect(isAdminPanelHost(host)).toBe(false);
      expect(isBackofficeHost(host)).toBe(false);

      vi.stubEnv('VITE_ADMIN_PANEL', 'true');
      expect(isAdminPanelHost(host)).toBe(true);
      expect(isBackofficeHost(host)).toBe(false);
      expect(isAdminPanelHost('circlesfera.com')).toBe(false);

      vi.stubEnv('VITE_ADMIN_PANEL', '');
      vi.stubEnv('VITE_BACKOFFICE', 'true');
      expect(isBackofficeHost(host)).toBe(true);
      expect(isAdminPanelHost(host)).toBe(false);
      expect(isBackofficeHost('circlesfera.com')).toBe(false);
    },
  );

  it('reads the host the app runs on when none is given', () => {
    at('https://admin.circlesfera.com/users');
    expect(isAdminPanelHost()).toBe(true);
    expect(isBackofficeHost()).toBe(false);

    at('https://backoffice.circlesfera.com/');
    expect(isBackofficeHost()).toBe(true);
    expect(isStaffHost()).toBe(true);
  });
});

describe('where each site lives', () => {
  it('in production, from any of the three sites', () => {
    at('https://circlesfera.com/ana');
    expect(platformOrigin()).toBe('https://circlesfera.com');
    expect(adminPanelOrigin()).toBe('https://admin.circlesfera.com');
    expect(backofficeOrigin()).toBe('https://backoffice.circlesfera.com');

    at('https://admin.circlesfera.com/users');
    expect(platformOrigin()).toBe('https://circlesfera.com');
    expect(adminPanelOrigin()).toBe('https://admin.circlesfera.com');
    expect(backofficeOrigin()).toBe('https://backoffice.circlesfera.com');

    at('https://backoffice.circlesfera.com/plans');
    expect(platformOrigin()).toBe('https://circlesfera.com');
    expect(adminPanelOrigin()).toBe('https://admin.circlesfera.com');
    expect(backofficeOrigin()).toBe('https://backoffice.circlesfera.com');
  });

  it('on a local machine, keeping the scheme and the port', () => {
    at('http://localhost:5173/');
    expect(platformOrigin()).toBe('http://localhost:5173');
    expect(adminPanelOrigin()).toBe('http://admin.localhost:5173');
    expect(backofficeOrigin()).toBe('http://backoffice.localhost:5173');

    at('http://admin.localhost:5173/users');
    expect(platformOrigin()).toBe('http://localhost:5173');
    expect(adminPanelOrigin()).toBe('http://admin.localhost:5173');
    expect(backofficeOrigin()).toBe('http://backoffice.localhost:5173');

    at('http://backoffice.localhost/');
    expect(platformOrigin()).toBe('http://localhost');
    expect(adminPanelOrigin()).toBe('http://admin.localhost');
    expect(backofficeOrigin()).toBe('http://backoffice.localhost');
  });

  it('at the configured hosts, with the local port when they are local', () => {
    vi.stubEnv('VITE_ADMIN_PANEL_HOST', 'panel.example.test');
    vi.stubEnv('VITE_BACKOFFICE_HOST', 'office.example.test');
    at('https://example.test/');
    expect(adminPanelOrigin()).toBe('https://panel.example.test');
    expect(backofficeOrigin()).toBe('https://office.example.test');

    vi.stubEnv('VITE_ADMIN_PANEL_HOST', 'panel.localhost');
    vi.stubEnv('VITE_BACKOFFICE_HOST', 'office.localhost');
    at('http://localhost:4000/');
    expect(adminPanelOrigin()).toBe('http://panel.localhost:4000');
    expect(backofficeOrigin()).toBe('http://office.localhost:4000');

    // Without a port in the address, the development server's own.
    at('http://localhost/');
    expect(adminPanelOrigin()).toBe('http://panel.localhost:5173');
    expect(backofficeOrigin()).toBe('http://office.localhost:5173');
  });

  it('with no browser at all, the production addresses', () => {
    vi.stubGlobal('window', undefined);
    expect(platformOrigin()).toBe('https://circlesfera.com');
    expect(adminPanelOrigin()).toBe('https://admin.circlesfera.com');
    expect(backofficeOrigin()).toBe('https://backoffice.circlesfera.com');
    expect(isStaffHost()).toBe(false);
  });
});
