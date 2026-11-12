import { SUGGESTIONS_MAX } from '@circlesfera/shared';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import SuggestedPeople from './SuggestedPeople';

vi.mock('../services', () => ({
  usersApi: { getSuggestions: vi.fn() },
  followsApi: { toggle: vi.fn() },
}));

const person = (n: number) => ({
  id: `p${n}`,
  username: `person${n}`,
  fullName: `Person ${n}`,
  avatar: null,
  bio: null,
  followersCount: 100 - n,
  reason: 'MOST_FOLLOWED' as const,
});

describe('SuggestedPeople', () => {
  beforeEach(() => vi.mocked(usersApi.getSuggestions).mockReset());

  it('asks for every suggestion and lists each person, under how they are chosen', async () => {
    vi.mocked(usersApi.getSuggestions).mockResolvedValue({
      data: [person(1), person(2), person(3)],
    } as never);
    const { i18n } = renderWithProviders(<SuggestedPeople />);

    expect(
      await screen.findByRole('link', { name: /person1/ }),
    ).toHaveAttribute('href', '/person1');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(usersApi.getSuggestions).toHaveBeenCalledWith(SUGGESTIONS_MAX);
    expect(
      screen.getByRole('heading', { name: i18n!.t('suggestions.title') }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('suggestions.how_chosen')),
    ).toBeInTheDocument();
  });

  it('says so when there is no one to suggest', async () => {
    vi.mocked(usersApi.getSuggestions).mockResolvedValue({ data: [] } as never);
    const { i18n } = renderWithProviders(<SuggestedPeople />);

    expect(
      await screen.findByText(i18n!.t('suggestions.empty')),
    ).toBeInTheDocument();
  });
});
