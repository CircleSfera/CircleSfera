import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeFriendsApi, searchApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import CloseFriendsModal from './CloseFriendsModal';

vi.mock('../../services', () => ({
  closeFriendsApi: {
    getCloseFriends: vi.fn(),
    toggleCloseFriend: vi.fn(),
  },
  searchApi: {
    searchUsers: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe('CloseFriendsModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(closeFriendsApi.getCloseFriends).mockResolvedValue({
      data: [],
    } as never);
    vi.mocked(closeFriendsApi.toggleCloseFriend).mockResolvedValue({
      data: { isCloseFriend: true },
    } as never);
    vi.mocked(searchApi.searchUsers).mockResolvedValue({
      data: [],
    } as never);
  });

  it('renders nothing when closed and does not fetch', () => {
    renderWithProviders(<CloseFriendsModal isOpen={false} onClose={onClose} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(closeFriendsApi.getCloseFriends).not.toHaveBeenCalled();
  });

  it('loads the list when open and shows the empty state', async () => {
    renderWithProviders(<CloseFriendsModal isOpen onClose={onClose} />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Close Friends')).toBeInTheDocument();
    expect(await screen.findByText('Close Friends List')).toBeInTheDocument();
    expect(
      screen.getByText(
        "We don't send notifications when you edit your close friends list.",
      ),
    ).toBeInTheDocument();
    expect(closeFriendsApi.getCloseFriends).toHaveBeenCalledTimes(1);
  });

  it('closes from Done and the dialog X without toggling', async () => {
    renderWithProviders(<CloseFriendsModal isOpen onClose={onClose} />);

    await screen.findByText('Close Friends List');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(closeFriendsApi.toggleCloseFriend).not.toHaveBeenCalled();
  });

  it('asks for two characters before searching', async () => {
    renderWithProviders(<CloseFriendsModal isOpen onClose={onClose} />);

    await screen.findByText('Close Friends List');
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'a' },
    });

    expect(
      await screen.findByText('Type at least 2 characters to search.'),
    ).toBeInTheDocument();
    expect(searchApi.searchUsers).not.toHaveBeenCalled();
  });
});
