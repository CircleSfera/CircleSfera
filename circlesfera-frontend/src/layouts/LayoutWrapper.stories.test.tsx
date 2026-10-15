import { fireEvent, screen } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import LayoutWrapper from './LayoutWrapper';

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

const story = vi.hoisted(() => ({ closeStories: vi.fn() }));

vi.mock('../stores/storyStore', () => ({
  useStoryStore: () => ({
    isOpen: true,
    stories: [{ id: 's-1' }],
    initialIndex: 0,
    closeStories: story.closeStories,
  }),
}));

// A story with a place on it, as a link to the map.
vi.mock('../components/StoryViewer', () => ({
  default: () => <Link to="/explore/map?place=pl-1">Puerta del Sol</Link>,
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

function renderFeed() {
  return renderWithProviders(
    <Routes>
      {['/', '/explore/map'].map((path) => (
        <Route
          key={path}
          path={path}
          element={
            <LayoutWrapper>
              <div>page</div>
            </LayoutWrapper>
          }
        />
      ))}
    </Routes>,
    { routerProps: { initialEntries: ['/'] } },
  );
}

describe('LayoutWrapper with a story open', () => {
  it('keeps the story open while the page stays, and closes it when a link of the story leads elsewhere', () => {
    renderFeed();
    expect(story.closeStories).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('link', { name: 'Puerta del Sol' }));

    expect(story.closeStories).toHaveBeenCalledTimes(1);
  });
});
