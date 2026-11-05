import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { placesApi } from '../services/places.service';
import { renderWithProviders } from '../test/test-utils';
import PlacePage from './PlacePage';

vi.mock('../services/places.service', () => ({
  placesApi: { getById: vi.fn(), getPosts: vi.fn() },
}));
vi.mock('../components/profile/PostGrid', () => ({
  default: ({
    items,
    emptyMessage,
  }: {
    items: { id: string }[];
    emptyMessage: string;
  }) => (
    <ul>
      {items.length === 0 ? (
        <li>{emptyMessage}</li>
      ) : (
        items.map((p) => <li key={p.id}>{p.id}</li>)
      )}
    </ul>
  ),
}));

const open = () =>
  renderWithProviders(
    <Routes>
      <Route path="/explore/places/:id" element={<PlacePage />} />
    </Routes>,
    { lng: 'en', routerProps: { initialEntries: ['/explore/places/pl1'] } },
  );

describe('PlacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(placesApi.getById).mockResolvedValue({
      data: {
        id: 'pl1',
        name: 'Cádiz',
        fullName: 'Cádiz, España',
        postCount: 1,
      },
    } as never);
    vi.mocked(placesApi.getPosts).mockResolvedValue({
      data: {
        data: [{ id: 'p1' }],
        meta: { page: 1, totalPages: 1, total: 1 },
      },
    } as never);
  });

  it('shows the place, its full name and the posts made there', async () => {
    open();
    expect(
      await screen.findByRole('heading', { name: 'Cádiz' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cádiz, España')).toBeInTheDocument();
    expect(await screen.findByText('1 post')).toBeInTheDocument();
    expect(screen.getByText('p1')).toBeInTheDocument();
  });

  it('says when there are no posts, and when it could not be opened', async () => {
    vi.mocked(placesApi.getPosts).mockResolvedValue({
      data: { data: [], meta: { page: 1, totalPages: 0, total: 0 } },
    } as never);
    const first = open();
    expect(await screen.findByText('No posts here yet')).toBeInTheDocument();
    first.unmount();

    vi.mocked(placesApi.getById).mockRejectedValue(new Error('gone'));
    open();
    expect(
      await screen.findByText('Could not open this place'),
    ).toBeInTheDocument();
  });
});
