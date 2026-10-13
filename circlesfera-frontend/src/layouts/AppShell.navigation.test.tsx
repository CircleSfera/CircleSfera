import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Link, Route, Routes, useSearchParams } from 'react-router-dom';
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
      <Link to="/notifications">Notifications</Link>
    </nav>
  ),
}));

vi.mock('../components/navigation/Sidebar', () => ({
  default: () => (
    <aside aria-label="Sidebar">
      <Link to="/frames">Frames</Link>
      <Link to="/notifications">Notifications</Link>
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
        <Route path="/notifications" element={<NotificationsStub />} />
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
  it('unmounts Frames and mounts Notifications when navigating to /notifications', async () => {
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

// A screen with something of its own to lose: a number it counts, and a
// section it keeps in its address.
function SectionsStub() {
  const [taps, setTaps] = useState(0);
  const [params, setParams] = useSearchParams();
  return (
    <div>
      <p data-testid="taps">{taps}</p>
      <p data-testid="section">{params.get('tab') ?? 'posts'}</p>
      <button type="button" onClick={() => setTaps((n) => n + 1)}>
        Tap
      </button>
      <button
        type="button"
        onClick={() => setParams({ tab: 'frames' }, { replace: true })}
      >
        Frames section
      </button>
      <Link to="/ana?tab=saved">Saved by link</Link>
    </div>
  );
}

describe('AppShell and a screen that rewrites its own address', () => {
  const show = () =>
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/:username" element={<SectionsStub />} />
        </Route>
      </Routes>,
      { routerProps: { initialEntries: ['/ana'], useTransitions: false } },
    );

  it('keeps the screen as it is when the section changes in place', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Tap' }));
    await user.click(screen.getByRole('button', { name: 'Tap' }));
    expect(screen.getByTestId('taps')).toHaveTextContent('2');

    await user.click(screen.getByRole('button', { name: 'Frames section' }));

    expect(screen.getByTestId('section')).toHaveTextContent('frames');
    // Mounted again, the screen would have started over from zero.
    expect(screen.getByTestId('taps')).toHaveTextContent('2');
  });

  it('still mounts the screen anew when a link leads to it', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Tap' }));
    expect(screen.getByTestId('taps')).toHaveTextContent('1');

    await user.click(screen.getByRole('link', { name: 'Saved by link' }));

    await waitFor(() =>
      expect(screen.getByTestId('section')).toHaveTextContent('saved'),
    );
    expect(screen.getByTestId('taps')).toHaveTextContent('0');
  });
});

function BrokenStub(): never {
  throw new Error('this screen is broken');
}

describe('AppShell when a screen fails', () => {
  it('shows the error inside the layout, keeps the navigation and recovers on another screen', async () => {
    // React logs the caught error; keep the test output clean.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const user = userEvent.setup();
    const { i18n } = renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/broken" element={<BrokenStub />} />
          <Route path="/notifications" element={<NotificationsStub />} />
        </Route>
      </Routes>,
      {
        routerProps: { initialEntries: ['/broken'], useTransitions: false },
      },
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      i18n!.t('common.error_message_page'),
    );
    // The rest of the app is still within reach.
    expect(screen.getByLabelText('Sidebar')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile navigation')).toBeInTheDocument();

    await user.click(screen.getAllByRole('link', { name: 'Notifications' })[0]);

    await waitFor(() => {
      expect(screen.getByTestId('notifications-page')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
