import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import AdminGuard from './AdminGuard';

vi.mock('../../stores/adminAuthStore', () => ({
  useAdminAuthStore: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function renderGuard(children: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/trust']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/:tab" element={<AdminGuard>{children}</AdminGuard>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminGuard (Admin Panel)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when admin session is valid', () => {
    vi.mocked(useAdminAuthStore).mockImplementation(((selector: any) => {
      const state = {
        isAuthenticated: true,
        isSessionChecked: true,
        checkSession: vi.fn(),
        admin: {
          id: 'a1',
          email: 'ops@circlesfera.com',
          displayName: 'Ops',
          roles: ['SUPER_ADMIN'],
          permissions: ['admins.manage'],
        },
      };
      return selector ? selector(state) : state;
    }) as any);

    renderGuard(<div>Admin Content</div>);
    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('redirects unauthenticated operators to /login', () => {
    vi.mocked(useAdminAuthStore).mockImplementation(((selector: any) => {
      const state = {
        isAuthenticated: false,
        isSessionChecked: true,
        checkSession: vi.fn(),
        admin: null,
      };
      return selector ? selector(state) : state;
    }) as any);

    renderGuard(<div>Admin Content</div>);
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});
