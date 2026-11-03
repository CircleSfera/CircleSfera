import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchApi } from '../../services/search.service';
import { renderWithProviders } from '../../test/test-utils';
import CaptionSuggestions from './CaptionSuggestions';

vi.mock('../../services/search.service', () => ({
  searchApi: { searchUsers: vi.fn(), searchHashtags: vi.fn() },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: unknown) => value,
}));

describe('CaptionSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchApi.searchUsers).mockResolvedValue({
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

    fireEvent.click(await screen.findByRole('button', { name: /@ana/ }));
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

  it('looks nothing up for a word too short', async () => {
    renderWithProviders(
      <CaptionSuggestions
        token={{ kind: 'mention', query: 'a', start: 0 }}
        onPick={vi.fn()}
      />,
    );

    await waitFor(() => expect(searchApi.searchUsers).not.toHaveBeenCalled());
    expect(screen.queryByRole('list')).toBeNull();
  });
});
