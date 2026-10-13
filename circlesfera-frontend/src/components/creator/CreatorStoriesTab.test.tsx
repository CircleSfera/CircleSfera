import { fireEvent, screen } from '@testing-library/react';
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

  it('writes a story in words in Spanish: its figures, its state and when it ends', async () => {
    vi.mocked(creatorApi.getStories).mockResolvedValue({
      data: {
        data: [activeStory],
        meta: { total: 1, page: 1, limit: 12, totalPages: 1 },
      },
    } as never);

    renderWithProviders(<CreatorStoriesTab />, { lng: 'es' });

    expect(
      await screen.findByRole('button', { name: /^Abrir la historia del / }),
    ).toBeInTheDocument();
    expect(screen.getByText('4 vistas · 1 reacción')).toBeInTheDocument();
    // Under the facts on a phone, at the end of the row on desktop.
    expect(screen.getAllByText('Activa')).toHaveLength(2);
    expect(screen.getByText(/^Caduca dentro de /)).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('says when a story ended and shows a mark when its picture is gone', async () => {
    vi.mocked(creatorApi.getStories).mockResolvedValue({
      data: {
        data: [
          {
            ...activeStory,
            expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          },
        ],
        meta: { total: 1, page: 1, limit: 12, totalPages: 1 },
      },
    } as never);

    const { container } = renderWithProviders(<CreatorStoriesTab />);

    expect(await screen.findAllByText('Expired')).toHaveLength(2);
    expect(screen.getByText(/^Expired on /)).toBeInTheDocument();

    const picture = container.querySelector('img');
    expect(picture).not.toBeNull();
    fireEvent.error(picture as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
  });
});
