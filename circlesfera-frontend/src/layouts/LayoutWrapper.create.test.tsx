import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import LayoutWrapper from './LayoutWrapper';

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: true }),
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

function renderCreateRoute() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/create"
        element={
          <LayoutWrapper>
            <div data-testid="create-page">Create</div>
          </LayoutWrapper>
        }
      />
    </Routes>,
    { routerProps: { initialEntries: ['/create'] } },
  );
}

describe('LayoutWrapper /create immersive shell', () => {
  it('hides TopNav and BottomNav on /create while keeping main content', () => {
    renderCreateRoute();

    expect(screen.getByTestId('create-page')).toBeInTheDocument();
    expect(screen.queryByLabelText('Top navigation')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Mobile navigation'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
  });
});

function renderEditsRoute() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/edits"
        element={
          <LayoutWrapper>
            <div data-testid="edits-page">Edits</div>
          </LayoutWrapper>
        }
      />
    </Routes>,
    { routerProps: { initialEntries: ['/edits'] } },
  );
}

describe('LayoutWrapper /edits immersive shell', () => {
  it('hides TopNav, BottomNav, and Sidebar on /edits for full-screen studio', () => {
    renderEditsRoute();

    expect(screen.getByTestId('edits-page')).toBeInTheDocument();
    expect(screen.queryByLabelText('Top navigation')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Mobile navigation'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Sidebar')).not.toBeInTheDocument();
  });
});
