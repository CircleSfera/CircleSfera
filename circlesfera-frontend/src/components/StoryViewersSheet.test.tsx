import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import { StoryViewersSheet } from './StoryViewersSheet';

vi.mock('./interactive/StickerResultsCard', () => ({
  StickerResultsCard: ({ sticker }: { sticker: { id: string } }) => (
    <div data-testid="results-card">{sticker.id}</div>
  ),
}));

vi.mock('./UserAvatar', () => ({
  default: () => <div data-testid="user-avatar" />,
}));

describe('StoryViewersSheet', () => {
  it('shows viewers title from the catalog when there is no Q&A', () => {
    const onClose = vi.fn();
    const { i18n } = renderWithProviders(
      <StoryViewersSheet viewers={[]} isLoading={false} onClose={onClose} />,
    );

    expect(i18n!.t('story.viewers')).toBe('Viewers');
    expect(
      screen.getByRole('heading', { name: i18n!.t('story.viewers') }),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('story.no_views'))).toBeInTheDocument();
    expect(screen.queryByText('Espectadores')).not.toBeInTheDocument();
  });

  it('opens on the responses of each sticker, with the views a tab away', () => {
    const { i18n } = renderWithProviders(
      <StoryViewersSheet
        viewers={[]}
        isLoading={false}
        onClose={vi.fn()}
        stickers={[
          {
            id: 'st-1',
            kind: 'POLL',
            settings: {},
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
          },
          {
            id: 'st-2',
            kind: 'QUESTION',
            settings: {},
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
          },
        ]}
      />,
    );

    expect(
      screen.getByText(i18n!.t('story.insights_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: i18n!.t('story.responses_tab') }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getAllByTestId('results-card').map((n) => n.textContent),
    ).toEqual(['st-1', 'st-2']);
  });

  it('labels viewer more action from common.more', () => {
    const { i18n } = renderWithProviders(
      <StoryViewersSheet
        viewers={[
          {
            id: 'u1',
            profile: { username: 'alice', fullName: 'Alice', avatar: null },
          } as never,
        ]}
        isLoading={false}
        onClose={vi.fn()}
      />,
    );

    expect(i18n!.t('common.more')).toBe('More');
    expect(
      screen.getByRole('button', { name: i18n!.t('common.more') }),
    ).toBeInTheDocument();
  });

  it('switches to views tab copy from the catalog', () => {
    const { i18n } = renderWithProviders(
      <StoryViewersSheet
        viewers={[]}
        isLoading={false}
        onClose={vi.fn()}
        stickers={[
          {
            id: 'st-1',
            kind: 'POLL',
            settings: {},
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole('tab', { name: new RegExp(i18n!.t('story.views_tab')) }),
    );
    expect(screen.getByText(i18n!.t('story.no_views'))).toBeInTheDocument();
  });

  it('exposes unlock toast keys in the story catalog', () => {
    const { i18n } = renderWithProviders(
      <StoryViewersSheet viewers={[]} isLoading={false} onClose={vi.fn()} />,
    );

    expect(i18n!.t('story.unlock_success')).toBe('Story unlocked');
    expect(i18n!.t('story.unlock_error')).toBe('Could not unlock story');
  });
});
