import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import StoryList from './StoryList';

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: { profile: { id: string } }) => unknown) =>
    selector({ profile: { id: 'me' } }),
}));

vi.mock('../stores/storyStore', () => ({
  useStoryStore: (selector: (s: { openStories: () => void }) => unknown) =>
    selector({ openStories: vi.fn() }),
}));

vi.mock('./UserAvatar', () => ({
  default: () => <div data-testid="user-avatar" />,
}));

vi.mock('../services', () => ({
  storiesApi: {
    getAll: vi.fn(),
  },
  liveApi: {
    getActiveStreams: vi.fn(),
  },
}));

import { liveApi, storiesApi } from '../services';

describe('StoryList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storiesApi.getAll).mockResolvedValue({ data: [] } as never);
    vi.mocked(liveApi.getActiveStreams).mockResolvedValue([] as never);
  });

  it('shows Your story from the catalog, not Spanish', async () => {
    const { i18n } = renderWithProviders(<StoryList />);

    await waitFor(() => {
      expect(screen.getByText(i18n!.t('story.yours'))).toBeInTheDocument();
    });
    expect(i18n!.t('story.yours')).toBe('Your story');
    expect(screen.queryByText('Tu story')).not.toBeInTheDocument();
  });

  it('uses Spanish add-story label', async () => {
    const { i18n } = renderWithProviders(<StoryList />, { lng: 'es' });

    await waitFor(() => {
      expect(screen.getByText(i18n!.t('story.yours'))).toBeInTheDocument();
    });
    expect(i18n!.t('story.yours')).toBe('Tu story');
  });
});
