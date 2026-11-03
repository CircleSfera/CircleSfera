import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchApi } from '../../services/search.service';
import { renderWithProviders } from '../../test/test-utils';
import CaptionSuggestions from './CaptionSuggestions';

vi.mock('../../services/search.service', () => ({
  searchApi: { suggestMentions: vi.fn(), searchHashtags: vi.fn() },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: unknown) => value,
}));

describe('CaptionSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchApi.suggestMentions).mockResolvedValue({
      data: [{ id: 'p1', username: 'ana', fullName: 'Ana' }],
    } as never);
    vi.mocked(searchApi.searchHashtags).mockResolvedValue({
      data: [{ id: 'h1', tag: 'mar', postCount: 3 }],
    } as never);
  });

  it('offers people for a mention, and gives back the one tapped', async () => {
    const onPick = vi.fn();
    renderWithProviders(
      <CaptionSuggestions
        token={{ kind: 'mention', query: 'an', start: 0 }}
        onPick={onPick}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /ana/ }));
    expect(onPick).toHaveBeenCalledWith('ana');
    expect(searchApi.searchHashtags).not.toHaveBeenCalled();
  });

  it('offers tags for a hashtag', async () => {
    const onPick = vi.fn();
    renderWithProviders(
      <CaptionSuggestions
        token={{ kind: 'hashtag', query: 'ma', start: 0 }}
        onPick={onPick}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /#mar/ }));
    expect(onPick).toHaveBeenCalledWith('mar');
  });

  it('offers the people followed right after @, before any letter', async () => {
    renderWithProviders(
      <CaptionSuggestions
        token={{ kind: 'mention', query: '', start: 0 }}
        onPick={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: /ana/ })).toBeVisible();
    expect(searchApi.suggestMentions).toHaveBeenCalledWith('');
  });

  it('looks no tag up before the first letter after #', async () => {
    renderWithProviders(
      <CaptionSuggestions
        token={{ kind: 'hashtag', query: '', start: 0 }}
        onPick={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(searchApi.searchHashtags).not.toHaveBeenCalled(),
    );
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows what is under it when there is nothing to suggest, with no list', async () => {
    renderWithProviders(
      <CaptionSuggestions token={null} onPick={vi.fn()}>
        <p>opciones</p>
      </CaptionSuggestions>,
    );

    expect(screen.getByText('opciones')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('takes the place of what is under it while it suggests', async () => {
    renderWithProviders(
      <CaptionSuggestions
        token={{ kind: 'mention', query: 'an', start: 0 }}
        onPick={vi.fn()}
      >
        <p>opciones</p>
      </CaptionSuggestions>,
    );

    await screen.findByRole('button', { name: /ana/ });
    expect(screen.queryByText('opciones')).toBeNull();
  });
});
