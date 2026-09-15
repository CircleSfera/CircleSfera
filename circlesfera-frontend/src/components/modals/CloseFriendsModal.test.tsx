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
    const { i18n } = renderWithProviders(
      <CloseFriendsModal isOpen onClose={onClose} />,
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('settings.close_friends_modal.title')),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        i18n!.t('settings.close_friends_modal.list_title'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('settings.close_friends_modal.list_desc')),
    ).toBeInTheDocument();
    expect(closeFriendsApi.getCloseFriends).toHaveBeenCalledTimes(1);
  });

  it('closes from Done and the dialog X without toggling', async () => {
    const { i18n } = renderWithProviders(
      <CloseFriendsModal isOpen onClose={onClose} />,
    );

    await screen.findByText(i18n!.t('settings.close_friends_modal.list_title'));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.close_friends_modal.done'),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(closeFriendsApi.toggleCloseFriend).not.toHaveBeenCalled();
  });

  it('asks for two characters before searching', async () => {
    const { i18n } = renderWithProviders(
      <CloseFriendsModal isOpen onClose={onClose} />,
    );

    await screen.findByText(i18n!.t('settings.close_friends_modal.list_title'));
    fireEvent.change(
      screen.getByPlaceholderText(
        i18n!.t('settings.close_friends_modal.search'),
      ),
      {
        target: { value: 'a' },
      },
    );

    expect(
      await screen.findByText(
        i18n!.t('settings.close_friends_modal.search_min'),
      ),
    ).toBeInTheDocument();
    expect(searchApi.searchUsers).not.toHaveBeenCalled();
  });
});
