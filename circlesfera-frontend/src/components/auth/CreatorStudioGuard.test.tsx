import { screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
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
    vi.mocked(useAuthStore).mockImplementation(((selector: any) => {
      const state = {
        isAuthenticated: true,
        isSessionChecked: true,
        profile: {
          username: 'creator',
          accountType: 'CREATOR',
        },
      };
      return selector ? selector(state) : state;
    }) as any);

    const { getByText } = renderWithProviders(
      <CreatorStudioGuard>
        <div>Studio Content</div>
      </CreatorStudioGuard>,
    );

    expect(getByText('Studio Content')).toBeInTheDocument();
  });

  it('renders children for BUSINESS accountType', () => {
    vi.mocked(useAuthStore).mockImplementation(((selector: any) => {
      const state = {
        isAuthenticated: true,
        isSessionChecked: true,
        profile: {
          username: 'biz',
          accountType: 'BUSINESS',
        },
      };
      return selector ? selector(state) : state;
    }) as any);

    const { getByText } = renderWithProviders(
      <CreatorStudioGuard>
        <div>Studio Content</div>
      </CreatorStudioGuard>,
    );

    expect(getByText('Studio Content')).toBeInTheDocument();
  });

  it('blocks PERSONAL authenticated users and toasts catalog copy', async () => {
    vi.mocked(useAuthStore).mockImplementation(((selector: any) => {
      const state = {
        isAuthenticated: true,
        isSessionChecked: true,
        profile: {
          username: 'user',
          accountType: 'PERSONAL',
        },
      };
      return selector ? selector(state) : state;
    }) as any);

    const { i18n } = renderWithProviders(
      <CreatorStudioGuard>
        <div>Studio Content</div>
      </CreatorStudioGuard>,
    );

    expect(screen.queryByText('Studio Content')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('creator.guard.creators_only'),
      );
    });
  });
});
