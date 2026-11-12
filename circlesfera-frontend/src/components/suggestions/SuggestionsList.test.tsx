import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import { SuggestionsList } from './SuggestionsList';

vi.mock('../../services', () => ({
  usersApi: { getSuggestions: vi.fn() },
}));

describe('SuggestionsList', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true });
    vi.mocked(usersApi.getSuggestions).mockResolvedValue({
      data: [
        {
          id: 'p1',
          username: 'ana',
          fullName: 'Ana',
          avatar: null,
          bio: null,
          followersCount: 120,
          reason: 'MOST_FOLLOWED',
        },
      ],
    } as unknown as Awaited<ReturnType<typeof usersApi.getSuggestions>>);
  });

  it.each(['horizontal', 'vertical'] as const)(
    'says how the people are chosen (%s)',
    async (layout) => {
      const { i18n } = renderWithProviders(<SuggestionsList layout={layout} />);

      expect(
        await screen.findByText(i18n!.t('suggestions.how_chosen')),
      ).toBeInTheDocument();
    },
  );

  it('opens every suggestion from See all', async () => {
    const { i18n } = renderWithProviders(
      <SuggestionsList layout="horizontal" />,
    );

    expect(
      await screen.findByRole('link', { name: i18n!.t('suggestions.see_all') }),
    ).toHaveAttribute('href', '/explore/people');
  });
});
