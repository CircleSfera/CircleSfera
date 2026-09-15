import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import AppShell from './AppShell';

vi.mock('../stores/authStore', () => {
  const state = { isAuthenticated: true };
  const fn = (selector: (s: typeof state) => unknown) => selector(state);
  fn.getState = () => state;
  return { useAuthStore: fn };
});

vi.mock('../services/realtime.service', () => ({
  realtimeService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getSocket: vi.fn(() => null),
  },
}));

vi.mock('../stores/socketStore', () => ({
  useSocketStore: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock('../stores/notificationsStore', () => ({
  useNotificationsStore: (
    selector: (s: { liveNotifications: unknown[] }) => unknown,
  ) => selector({ liveNotifications: [] }),
}));

vi.mock('../stores/storyStore', () => ({
  useStoryStore: () => ({
    isOpen: false,
    stories: [],
    initialIndex: 0,
    closeStories: vi.fn(),
  }),
}));

vi.mock('../components/auth/EmailVerificationBanner', () => ({
  default: () => null,
}));

vi.mock('../components/navigation/TopNav', () => ({
  default: () => <nav aria-label="Top navigation">TopNav</nav>,
}));

vi.mock('../components/navigation/BottomNav', () => ({
  default: () => (
    <nav aria-label="Mobile navigation">
      <Link to="/frames">Frames</Link>
      <Link to="/activity">Notifications</Link>
    </nav>
  ),
}));

vi.mock('../components/navigation/Sidebar', () => ({
  default: () => (
    <aside aria-label="Sidebar">
      <Link to="/frames">Frames</Link>
      <Link to="/activity">Notifications</Link>
    </aside>
  ),
}));

vi.mock('../components/common/BrandAmbientBackground', () => ({
  default: () => null,
}));

vi.mock('../components/common/OfflineIndicator', () => ({
  OfflineIndicator: () => null,
}));

vi.mock('../components/common/GlobalKeyboardShortcuts', () => ({
  GlobalKeyboardShortcuts: () => null,
}));

vi.mock('../components/auth/AppLockScreen', () => ({
  AppLockScreen: () => null,
}));

vi.mock('../components/CookieConsent', () => ({
  default: () => null,
}));

vi.mock('../components/modals/CreateBottomSheet', () => ({
  default: () => null,
}));

vi.mock('../components/navigation/GlobalCallContainer', () => ({
  GlobalCallContainer: () => null,
}));

function FramesStub() {
  return <div data-testid="frames-page">Frames</div>;
}

function NotificationsStub() {
  return <div data-testid="notifications-page">Notifications</div>;
}

function renderFramesNavigationTest() {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/frames" element={<FramesStub />} />
        <Route path="/activity" element={<NotificationsStub />} />
      </Route>
    </Routes>,
    {
      routerProps: {
        initialEntries: ['/frames'],
        useTransitions: false,
      },
    },
  );
}

describe('AppShell navigation from Frames', () => {
  it('unmounts Frames and mounts Notifications when navigating to /activity', async () => {
    const user = userEvent.setup();
    renderFramesNavigationTest();

    expect(screen.getByTestId('frames-page')).toBeInTheDocument();
    expect(screen.queryByTestId('notifications-page')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('link', { name: 'Notifications' })[0]);

    await waitFor(() => {
      expect(screen.getByTestId('notifications-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('frames-page')).not.toBeInTheDocument();
  });
});
