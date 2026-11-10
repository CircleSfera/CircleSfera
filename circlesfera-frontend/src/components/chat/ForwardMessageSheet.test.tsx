import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import ForwardMessageSheet from './ForwardMessageSheet';

vi.mock('../../services/chat.service', () => ({
  chatApi: { getConversations: vi.fn(), forwardMessage: vi.fn() },
}));
vi.mock('../UserAvatar', () => ({ default: () => <span /> }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    error: (m: string) => toastError(m),
  },
}));

import { chatApi } from '../../services/chat.service';

function chat(id: string, username: string) {
  return {
    id,
    isGroup: false,
    participants: [
      { profileId: 'me', profile: { username: 'me' } },
      { profileId: `p-${id}`, profile: { username } },
    ],
  };
}

// Picking chats to forward a message to: up to five, never the chat the
// message is in, and each chat's answer counted.

describe('ForwardMessageSheet', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chatApi.getConversations).mockResolvedValue({
      data: [
        chat('c-src', 'here'),
        ...['ana', 'bea', 'carla', 'dani', 'eva', 'fran'].map((u, i) =>
          chat(`c-${i}`, u),
        ),
      ],
    } as never);
  });

  const renderSheet = () =>
    renderWithProviders(
      <ForwardMessageSheet
        messageId="m-1"
        currentProfileId="me"
        fromConversationId="c-src"
        onClose={onClose}
      />,
    );

  it('leaves out the chat the message is in', async () => {
    renderSheet();
    await screen.findByText('ana');
    expect(screen.queryByText('here')).not.toBeInTheDocument();
  });

  it('lets no more than five chats be picked', async () => {
    renderSheet();
    await screen.findByText('ana');
    for (const name of ['ana', 'bea', 'carla', 'dani', 'eva']) {
      fireEvent.click(screen.getByText(name));
    }
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.filter((b) => (b as HTMLInputElement).checked)).toHaveLength(
      5,
    );
    expect(boxes[5]).toBeDisabled();
  });

  it('forwards to the chats picked and says how it went', async () => {
    vi.mocked(chatApi.forwardMessage).mockResolvedValue({
      data: {
        sent: ['c-0'],
        failed: [{ conversationId: 'c-1', errorCode: 'USER_BLOCKED' }],
      },
    } as never);
    renderSheet();
    await screen.findByText('ana');
    fireEvent.click(screen.getByText('ana'));
    fireEvent.click(screen.getByText('bea'));
    fireEvent.click(screen.getByRole('button', { name: 'Send to 2 chats' }));

    await waitFor(() =>
      expect(chatApi.forwardMessage).toHaveBeenCalledWith('m-1', [
        'c-0',
        'c-1',
      ]),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Forwarded to 1 chat');
    expect(toastError).toHaveBeenCalledWith('1 chat could not receive it');
    expect(onClose).toHaveBeenCalled();
  });

  it('says why when the message cannot be forwarded', async () => {
    vi.mocked(chatApi.forwardMessage).mockRejectedValue({
      isAxiosError: true,
      response: { data: { errorCode: 'MESSAGE_NOT_FORWARDABLE' } },
    });
    renderSheet();
    await screen.findByText('ana');
    fireEvent.click(screen.getByText('ana'));
    fireEvent.click(screen.getByRole('button', { name: 'Send to 1 chat' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'This message cannot be forwarded.',
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
