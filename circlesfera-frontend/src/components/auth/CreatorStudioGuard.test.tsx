import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../stores/authStore';
import CreatorStudioGuard from './CreatorStudioGuard';

vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('CreatorStudioGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children for CREATOR accountType', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      profile: {
        username: 'creator',
        accountType: 'CREATOR',
      },
    } as unknown as ReturnType<typeof useAuthStore>);

    render(
      <MemoryRouter>
        <CreatorStudioGuard>
          <div>Studio Content</div>
        </CreatorStudioGuard>
      </MemoryRouter>,
    );

    expect(screen.getByText('Studio Content')).toBeInTheDocument();
  });

  it('renders children for BUSINESS accountType', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      profile: {
        username: 'biz',
        accountType: 'BUSINESS',
      },
    } as unknown as ReturnType<typeof useAuthStore>);

    render(
      <MemoryRouter>
        <CreatorStudioGuard>
          <div>Studio Content</div>
        </CreatorStudioGuard>
      </MemoryRouter>,
    );

    expect(screen.getByText('Studio Content')).toBeInTheDocument();
  });

  it('blocks PERSONAL authenticated users', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      profile: {
        username: 'user',
        accountType: 'PERSONAL',
      },
    } as unknown as ReturnType<typeof useAuthStore>);

    render(
      <MemoryRouter>
        <CreatorStudioGuard>
          <div>Studio Content</div>
        </CreatorStudioGuard>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Studio Content')).not.toBeInTheDocument();
  });
});
