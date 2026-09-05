import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commentsApi, postsApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import PostDetail from './PostDetail';

vi.mock('../services', () => ({
  postsApi: { getById: vi.fn() },
  commentsApi: { getByPost: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../components/common/SEO', () => ({
  default: () => null,
}));

vi.mock('../components/post/PostDetailView', () => ({
  default: () => <div data-testid="post-detail">Post detail</div>,
}));

function renderPost(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/p/:id" element={<PostDetail />} />
      <Route
        path="/frames"
        element={<div data-testid="frames-page">Frames</div>}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: [`/p/${id}`],
        useTransitions: false,
      },
    },
  );
}

describe('PostDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(commentsApi.getByPost).mockResolvedValue({
      data: { data: [] },
    } as never);
  });

  it('redirects FRAME posts to the Frames viewer', async () => {
    vi.mocked(postsApi.getById).mockResolvedValue({
      data: { id: 'frame-1', type: 'FRAME' },
    } as never);

    renderPost('frame-1');

    await waitFor(() => {
      expect(screen.getByTestId('frames-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('post-detail')).not.toBeInTheDocument();
  });

  it('renders post detail for a regular post', async () => {
    vi.mocked(postsApi.getById).mockResolvedValue({
      data: {
        id: 'post-1',
        type: 'POST',
        caption: 'Hello',
        profile: { username: 'alice' },
        media: [],
      },
    } as never);

    renderPost('post-1');

    await waitFor(() => {
      expect(screen.getByTestId('post-detail')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('frames-page')).not.toBeInTheDocument();
  });
});
