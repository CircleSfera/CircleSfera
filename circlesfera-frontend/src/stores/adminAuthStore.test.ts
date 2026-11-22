import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuthApi } from '../services/admin-auth.service';
import { useAdminAuthStore } from './adminAuthStore';

vi.mock('../services/admin-auth.service', () => ({
  adminAuthApi: { me: vi.fn(), logout: vi.fn() },
}));

// Signing out loads the panel again, which jsdom cannot do.
const originalLocation = window.location;
const assign = vi.fn();
const at = (pathname: string) =>
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, pathname, assign },
  });

const staff = (roles: string[], permissions: string[]) =>
  ({ id: 'a1', email: 'ops@circlesfera.com', roles, permissions }) as never;

describe('adminAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAdminAuthStore.setState({
      admin: null,
      isAuthenticated: false,
      isSessionChecked: false,
      isCheckingSession: false,
    });
    at('/reports');
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('confirms the staff session once with the server', async () => {
    vi.mocked(adminAuthApi.me).mockResolvedValue({
      data: staff(['MODERATOR'], ['reports.review']),
    } as never);

    await Promise.all([
      useAdminAuthStore.getState().checkSession(),
      useAdminAuthStore.getState().checkSession(),
    ]);
    await useAdminAuthStore.getState().checkSession();

    expect(adminAuthApi.me).toHaveBeenCalledTimes(1);
    expect(useAdminAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      isSessionChecked: true,
      isCheckingSession: false,
    });
  });

  it('drops a staff session the server rejects', async () => {
    useAdminAuthStore.setState({
      admin: staff(['SUPER_ADMIN'], []),
      isAuthenticated: true,
    });
    vi.mocked(adminAuthApi.me).mockRejectedValue(new Error('401'));

    await useAdminAuthStore.getState().checkSession();

    expect(useAdminAuthStore.getState()).toMatchObject({
      admin: null,
      isAuthenticated: false,
      isSessionChecked: true,
    });
  });

  it('signs staff out locally even when the server cannot be reached', async () => {
    useAdminAuthStore.getState().setAdmin(staff(['MODERATOR'], []));
    vi.mocked(adminAuthApi.logout).mockRejectedValue(new Error('offline'));

    await useAdminAuthStore.getState().logout();

    expect(useAdminAuthStore.getState()).toMatchObject({
      admin: null,
      isAuthenticated: false,
    });
  });

  it('loads the panel again from its sign-in page after signing out', async () => {
    useAdminAuthStore.getState().setAdmin(staff(['MODERATOR'], []));
    vi.mocked(adminAuthApi.logout).mockResolvedValue({} as never);

    await useAdminAuthStore.getState().logout();

    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('does not load the sign-in page again when already on it', async () => {
    at('/login');
    vi.mocked(adminAuthApi.logout).mockResolvedValue({} as never);

    await useAdminAuthStore.getState().logout();

    expect(assign).not.toHaveBeenCalled();
  });

  it('signs staff out when a panel request reports the session ended', async () => {
    useAdminAuthStore.getState().setAdmin(staff(['MODERATOR'], []));
    vi.mocked(adminAuthApi.logout).mockResolvedValue({} as never);

    window.dispatchEvent(new Event('auth:admin_unauthorized'));

    await vi.waitFor(() =>
      expect(useAdminAuthStore.getState().isAuthenticated).toBe(false),
    );
  });

  it('shows panel sections only for granted permissions (the server still enforces them)', () => {
    const { hasPermission, setAdmin } = useAdminAuthStore.getState();
    expect(hasPermission('reports.review')).toBe(false);

    setAdmin(staff(['MODERATOR'], ['reports.review']));
    expect(useAdminAuthStore.getState().hasPermission('reports.review')).toBe(
      true,
    );
    expect(useAdminAuthStore.getState().hasPermission('admins.manage')).toBe(
      false,
    );

    setAdmin(staff(['ADMIN'], ['admins.manage']));
    expect(useAdminAuthStore.getState().hasPermission('admins.manage')).toBe(
      true,
    );

    setAdmin(staff(['SUPER_ADMIN'], []));
    expect(useAdminAuthStore.getState().hasPermission('anything')).toBe(true);
  });
});
