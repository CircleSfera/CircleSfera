import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileApi } from '../../services/profile.service';
import { useAuthStore } from '../../stores/authStore';
import AuthGuard from './AuthGuard';
import GuestGuard from './GuestGuard';

vi.mock('../../services/profile.service', () => ({
  profileApi: { getMyProfile: vi.fn() },
}));
vi.mock('../../services/auth.service', () => ({
  authApi: { logout: vi.fn() },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/accounts/login" element={<div>Login page</div>} />
        <Route path="/onboarding" element={<div>Onboarding page</div>} />
        <Route
          path="/feed"
          element={
            <AuthGuard>
              <div>Private feed</div>
            </AuthGuard>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestGuard>
              <div>Sign-up form</div>
            </GuestGuard>
          }
        />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const profile = (isOnboarded: boolean) => ({
  id: 'p1',
  username: 'ana',
  user: { settings: { isOnboarded } },
});

const realCheckSession = useAuthStore.getState().checkSession;

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      checkSession: realCheckSession,
      profile: null,
      isAuthenticated: false,
      isSessionChecked: false,
      isCheckingSession: false,
    });
  });

  it('sends a visitor to sign in', async () => {
    renderAt('/feed');

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(profileApi.getMyProfile).not.toHaveBeenCalled();
  });

  it('shows nothing private until the server confirms a remembered session', async () => {
    let confirm: (value: unknown) => void = () => {};
    vi.mocked(profileApi.getMyProfile).mockReturnValue(
      new Promise((resolve) => {
        confirm = resolve;
      }) as never,
    );
    useAuthStore.setState({
      isAuthenticated: true,
      profile: profile(true) as never,
    });

    renderAt('/feed');

    expect(screen.queryByText('Private feed')).not.toBeInTheDocument();
    confirm({ data: profile(true) });
    expect(await screen.findByText('Private feed')).toBeInTheDocument();
  });

  it('does not render private content before the session check has started', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      profile: profile(true) as never,
      checkSession: vi.fn(async () => {}),
    });

    renderAt('/feed');

    expect(screen.queryByText('Private feed')).not.toBeInTheDocument();
  });

  it('signs out a remembered session the server no longer accepts', async () => {
    vi.mocked(profileApi.getMyProfile).mockRejectedValue(new Error('401'));
    useAuthStore.setState({
      isAuthenticated: true,
      profile: profile(true) as never,
    });

    renderAt('/feed');

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Private feed')).not.toBeInTheDocument();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it('sends an account that has not finished onboarding there first', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isSessionChecked: true,
      profile: profile(false) as never,
    });

    renderAt('/feed');

    expect(await screen.findByText('Onboarding page')).toBeInTheDocument();
  });
});

describe('GuestGuard', () => {
  it('shows sign-up to a visitor', () => {
    useAuthStore.setState({ isAuthenticated: false });
    renderAt('/signup');
    expect(screen.getByText('Sign-up form')).toBeInTheDocument();
  });

  it('sends a signed-in account home', async () => {
    useAuthStore.setState({ isAuthenticated: true, isSessionChecked: true });
    renderAt('/signup');
    await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
  });
});
