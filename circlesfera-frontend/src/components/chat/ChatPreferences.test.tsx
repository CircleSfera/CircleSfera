import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import ChatPreferences from './ChatPreferences';

vi.mock('../../services/chat.service', () => ({
  chatApi: {
    muteConversation: vi.fn(),
    unmuteConversation: vi.fn(),
    pinConversation: vi.fn(),
    unpinConversation: vi.fn(),
  },
}));
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  toast: { error: (m: string) => toastError(m) },
}));

import { chatApi } from '../../services/chat.service';

// The viewer's own choices for a chat: mute it for a while or for good, and
// pin it on top.

describe('ChatPreferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers how long to mute, and mutes for the one chosen', async () => {
    const onChange = vi.fn();
    vi.mocked(chatApi.muteConversation).mockResolvedValue({
      data: { mutedUntil: '9999-12-31T00:00:00.000Z' },
    } as never);
    renderWithProviders(
      <ChatPreferences
        conversationId="c-1"
        mutedUntil={null}
        pinnedAt={null}
        canPin
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mute messages' }));
    fireEvent.click(screen.getByRole('button', { name: '8 hours' }));

    await waitFor(() =>
      expect(chatApi.muteConversation).toHaveBeenCalledWith('c-1', '8h'),
    );
    expect(onChange).toHaveBeenCalledWith({
      mutedUntil: '9999-12-31T00:00:00.000Z',
    });
  });

  it('says a chat muted for good is muted until it is turned off, and unmutes it', async () => {
    vi.mocked(chatApi.unmuteConversation).mockResolvedValue({
      data: { mutedUntil: null },
    } as never);
    renderWithProviders(
      <ChatPreferences
        conversationId="c-1"
        mutedUntil="9999-12-31T00:00:00.000Z"
        pinnedAt={null}
        canPin
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Muted until you turn it off')).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mute messages' }));
    await waitFor(() =>
      expect(chatApi.unmuteConversation).toHaveBeenCalledWith('c-1'),
    );
  });

  it('says why a fourth pin is refused', async () => {
    vi.mocked(chatApi.pinConversation).mockRejectedValue({
      status: 409,
      data: { errorCode: 'CHAT_PINS_FULL' },
    });
    renderWithProviders(
      <ChatPreferences
        conversationId="c-1"
        mutedUntil={null}
        pinnedAt={null}
        canPin
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pin chat' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'You already have 3 pinned chats. Unpin one to pin another.',
      ),
    );
  });

  it('offers no pin for a message request', () => {
    renderWithProviders(
      <ChatPreferences
        conversationId="c-1"
        canPin={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('checkbox', { name: 'Pin chat' })).toBeNull();
  });
});
