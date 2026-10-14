import { screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { Route, Routes, useLocation } from 'react-router-dom';
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

// The sign-in page, saying where the guard says the person came from.
function CameFrom() {
  const { state } = useLocation();
  return <div>came from {state?.from?.pathname}</div>;
}

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

  const signedOut = (isSessionChecked: boolean) =>
    vi.mocked(useAuthStore).mockImplementation(((selector: any) => {
      const state = { isAuthenticated: false, isSessionChecked, profile: null };
      return selector ? selector(state) : state;
    }) as any);
  const showAt = (path: string) =>
    renderWithProviders(
      <Routes>
        <Route
          path="/creator/*"
          element={
            <CreatorStudioGuard>
              <div>Studio Content</div>
            </CreatorStudioGuard>
          }
        />
        <Route path="/accounts/login" element={<CameFrom />} />
      </Routes>,
      { routerProps: { initialEntries: [path], useTransitions: false } },
    );

  it('shows nothing of the studio while the session is still being checked', () => {
    signedOut(false);

    showAt('/creator/posts');

    expect(screen.queryByText('Studio Content')).not.toBeInTheDocument();
    expect(screen.queryByText(/^came from/)).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('sends someone without a session to sign in, remembering where they were going', () => {
    signedOut(true);

    showAt('/creator/posts');

    expect(screen.getByText('came from /creator/posts')).toBeInTheDocument();
    expect(screen.queryByText('Studio Content')).not.toBeInTheDocument();
    // Not being signed in is not "creators only".
    expect(toast.error).not.toHaveBeenCalled();
  });
});
