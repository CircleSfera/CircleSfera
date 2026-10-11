import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import LayoutWrapper from './LayoutWrapper';

const session = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock('../stores/authStore', () => {
  const fn = (selector: (s: typeof session) => unknown) => selector(session);
  fn.getState = () => session;
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
  default: () => <nav aria-label="Mobile navigation">BottomNav</nav>,
}));

vi.mock('../components/navigation/Sidebar', () => ({
  default: () => <aside>Sidebar</aside>,
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

function renderRoot() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <LayoutWrapper>
            <div data-testid="page">Page</div>
          </LayoutWrapper>
        }
      />
    </Routes>,
    { routerProps: { initialEntries: ['/'] } },
  );
}

// The wrapper the layout pads at the bottom on desktop is the grandparent
// of the page.
function paddedWrapper() {
  return screen.getByTestId('page').parentElement?.parentElement;
}

describe('LayoutWrapper at the root address', () => {
  beforeEach(() => {
    session.isAuthenticated = false;
  });

  it('adds no bottom padding under the landing of a visitor', () => {
    renderRoot();

    expect(paddedWrapper()).not.toHaveClass('md:pb-8');
  });

  it('keeps the bottom padding of the home feed once signed in', () => {
    session.isAuthenticated = true;
    renderRoot();

    expect(paddedWrapper()).toHaveClass('md:pb-8');
  });
});
