import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../stores/authStore';
import AdminGuard from './AdminGuard';

vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('AdminGuard', () => {
  it('renders children for ADMIN role', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      profile: {
        username: 'admin',
        user: { role: 'ADMIN' },
      },
    } as unknown as ReturnType<typeof useAuthStore>);

    render(
      <MemoryRouter>
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      </MemoryRouter>,
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('renders children for MODERATOR role', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      profile: {
        username: 'mod',
        user: { role: 'MODERATOR' },
      },
    } as unknown as ReturnType<typeof useAuthStore>);

    render(
      <MemoryRouter>
        <AdminGuard>
          <div>Mod Content</div>
        </AdminGuard>
      </MemoryRouter>,
    );

    expect(screen.getByText('Mod Content')).toBeInTheDocument();
  });

  it('blocks non-staff authenticated users', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      profile: {
        username: 'user',
        user: { role: 'USER' },
      },
    } as unknown as ReturnType<typeof useAuthStore>);

    render(
      <MemoryRouter>
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });
});
