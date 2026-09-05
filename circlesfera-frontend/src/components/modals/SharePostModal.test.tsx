import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import type { Conversation, Post, ProfileWithUser } from '../../types';
import SharePostModal from './SharePostModal';

vi.mock('../../services', () => ({
  chatApi: {
    getConversations: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

const author: ProfileWithUser = {
  id: 'author-1',
  userId: 'user-author',
  username: 'author',
  fullName: 'Author',
  bio: null,
  avatar: null,
  standardUrl: null,
  thumbnailUrl: null,
  website: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const bob: ProfileWithUser = {
  ...author,
  id: 'bob-1',
  userId: 'user-bob',
  username: 'bob',
  fullName: 'Bob',
};

const post: Post = {
  id: 'post-1',
  profileId: 'author-1',
  caption: 'Sunset at the pier',
  type: 'POST',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  profile: author,
  media: [],
  _count: { likes: 0, comments: 0 },
};

const dm: Conversation = {
  id: 'conv-dm',
  isGroup: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
  messages: [],
  participants: [
    { id: 'part-author', profileId: 'author-1', profile: author },
    { id: 'part-bob', profileId: 'bob-1', profile: bob },
  ],
};

const group: Conversation = {
  id: 'conv-group',
  isGroup: true,
  name: 'Weekend plans',
  updatedAt: '2026-01-01T00:00:00.000Z',
  messages: [],
  participants: [],
};

describe('SharePostModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chatApi.getConversations).mockResolvedValue({
      data: [dm, group],
    } as never);
    vi.mocked(chatApi.sendMessage).mockResolvedValue({} as never);
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <SharePostModal isOpen={false} onClose={onClose} post={post} />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chatApi.getConversations).not.toHaveBeenCalled();
  });

  it('closes from Done and the dialog X without sending', async () => {
    renderWithProviders(
      <SharePostModal isOpen onClose={onClose} post={post} />,
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Share to...')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(chatApi.sendMessage).not.toHaveBeenCalled();
  });

  it('lists the other DM participant and group name', async () => {
    renderWithProviders(
      <SharePostModal isOpen onClose={onClose} post={post} />,
    );

    expect(await screen.findByText('bob')).toBeInTheDocument();
    expect(screen.getByText('Weekend plans')).toBeInTheDocument();
    expect(screen.queryByText('author')).not.toBeInTheDocument();
  });

  it('filters conversations by search', async () => {
    renderWithProviders(
      <SharePostModal isOpen onClose={onClose} post={post} />,
    );

    await screen.findByText('bob');
    fireEvent.change(screen.getByPlaceholderText('Search conversations...'), {
      target: { value: 'week' },
    });

    expect(screen.getByText('Weekend plans')).toBeInTheDocument();
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no conversations', async () => {
    vi.mocked(chatApi.getConversations).mockResolvedValue({
      data: [],
    } as never);

    renderWithProviders(
      <SharePostModal isOpen onClose={onClose} post={post} />,
    );

    expect(
      await screen.findByText('No conversations found'),
    ).toBeInTheDocument();
    expect(chatApi.sendMessage).not.toHaveBeenCalled();
  });

  it('sends the post to the chosen conversation and disables a second send', async () => {
    vi.mocked(chatApi.getConversations).mockResolvedValue({
      data: [dm],
    } as never);

    renderWithProviders(
      <SharePostModal isOpen onClose={onClose} post={post} />,
    );

    await screen.findByText('bob');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-dm',
        content: 'Shared a post',
        postId: 'post-1',
      });
    });

    expect(screen.getByRole('button', { name: 'Sent' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sent' }));
    expect(chatApi.sendMessage).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets the user retry after a failed send', async () => {
    vi.mocked(chatApi.getConversations).mockResolvedValue({
      data: [dm],
    } as never);
    vi.mocked(chatApi.sendMessage)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({} as never);

    renderWithProviders(
      <SharePostModal isOpen onClose={onClose} post={post} />,
    );

    await screen.findByText('bob');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('button', { name: 'Send' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  it('uses the frame sheet title and preview and closes without sending', async () => {
    renderWithProviders(
      <SharePostModal
        isOpen
        onClose={onClose}
        post={post}
        presentation="frame"
      />,
    );

    expect(await screen.findByText('Share frame')).toBeInTheDocument();
    expect(screen.getByText('Sunset at the pier')).toBeInTheDocument();
    expect(screen.queryByText('Share to...')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Done' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('bob')).toBeInTheDocument();

    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(chatApi.sendMessage).not.toHaveBeenCalled();
  });
});
