import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorStory } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorStoriesTab from './CreatorStoriesTab';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getStories: vi.fn(),
  },
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (s: { profile: unknown }) => unknown) =>
    selector({ profile: { id: 'profile-1' } }),
}));

vi.mock('../../stores/storyStore', () => ({
  useStoryStore: (selector: (s: { openStories: unknown }) => unknown) =>
    selector({ openStories: vi.fn() }),
}));

vi.mock('../../services', () => ({
  storiesApi: {
    getArchive: vi.fn(),
  },
}));

const activeStory: CreatorStory = {
  id: 'story-1',
  url: 'https://cdn.example/story.jpg',
  mediaType: 'image',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
  _count: { views: 4, reactions: 1 },
};

describe('CreatorStoriesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('labels empty state from the EN catalog', async () => {
    vi.mocked(creatorApi.getStories).mockResolvedValue({
      data: { data: [], meta: { total: 0, page: 1, limit: 12, totalPages: 0 } },
    } as never);

    const { i18n } = renderWithProviders(<CreatorStoriesTab />);

    expect(
      await screen.findByText(i18n!.t('creator.stories.empty_title')),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.stories.empty_title')).toBe('No stories yet');
    expect(screen.queryByText('No hay historias')).not.toBeInTheDocument();
  });

  it('uses Spanish active badge and open aria-label from the catalog', async () => {
    vi.mocked(creatorApi.getStories).mockResolvedValue({
      data: {
        data: [activeStory],
        meta: { total: 1, page: 1, limit: 12, totalPages: 1 },
      },
    } as never);

    const { i18n } = renderWithProviders(<CreatorStoriesTab />, { lng: 'es' });

    expect(
      await screen.findByRole('button', {
        name: i18n!.t('creator.stories.open'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.stories.active')),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.stories.active')).toBe('Activa');
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });
});
