import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApi } from '../../services/chat.service';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import ConversationList from './ConversationList';

vi.mock('../../services/chat.service', () => ({
  chatApi: { getConversations: vi.fn(), getUnreadCount: vi.fn() },
}));
vi.mock('./NewChatModal', () => ({ default: () => null }));
vi.mock('../UserAvatar', () => ({ default: () => null }));
// Render every row: jsdom has no layout for the virtualizer to measure.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 72,
        key: index,
      })),
    getTotalSize: () => count * 72,
    measureElement: () => {},
  }),
}));

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
const socket = {
  on: (event: string, fn: Handler) => handlers.set(event, fn),
  off: (event: string) => handlers.delete(event),
};
vi.mock('../../stores/socketStore', () => ({
  useSocketStore: () => ({ socket, userStatuses: {} }),
}));

const conv = (id: string, username: string, text: string) => ({
  id,
  name: null,
  isGroup: false,
  participants: [
    { profileId: 'me', profile: { id: 'me', username: 'me' } },
    { profileId: `p-${id}`, profile: { id: `p-${id}`, username } },
  ],
  messages: [
    {
      id: `m-${id}`,
      conversationId: id,
      content: text,
      senderId: `p-${id}`,
      createdAt: '2026-10-01T10:00:00.000Z',
    },
  ],
  updatedAt: '2026-10-01T10:00:00.000Z',
});

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    useAuthStore.setState({ profile: { id: 'me', username: 'me' } as never });
    vi.mocked(chatApi.getUnreadCount).mockResolvedValue({
      data: { count: 2 },
    } as never);
    vi.mocked(chatApi.getConversations).mockImplementation(((folder: string) =>
      Promise.resolve({
        data:
          folder === 'requests'
            ? [conv('c9', 'stranger', 'hola')]
            : [conv('c1', 'ana', 'first'), conv('c2', 'leo', 'second')],
      })) as never);
  });

  const order = () =>
    screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h) => h?.startsWith('/direct/inbox/t/'));

  it('lists the inbox with the unread and request counts, in the app language', async () => {
    const { i18n } = renderWithProviders(<ConversationList />, { lng: 'en' });

    expect(await screen.findByText('ana')).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('chat.inbox'))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('chat.requests'))).toBeInTheDocument();
    expect(screen.queryByText('Bandeja')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows message requests in their own folder', async () => {
    const { i18n } = renderWithProviders(<ConversationList />);
    await screen.findByText('ana');

    fireEvent.click(screen.getByText(i18n!.t('chat.requests')));

    expect(await screen.findByText('stranger')).toBeInTheDocument();
    expect(screen.queryByText('ana')).not.toBeInTheDocument();
  });

  it('says there are no requests in the app language', async () => {
    vi.mocked(chatApi.getConversations).mockResolvedValue({
      data: [],
    } as never);
    const { i18n } = renderWithProviders(<ConversationList />, { lng: 'en' });
    await screen.findByText(i18n!.t('chat.no_messages'));

    fireEvent.click(screen.getByText(i18n!.t('chat.requests')));

    expect(
      await screen.findByText(i18n!.t('chat.no_requests')),
    ).toBeInTheDocument();
  });

  it('filters conversations by name', async () => {
    const { i18n } = renderWithProviders(<ConversationList />);
    await screen.findByText('ana');

    fireEvent.change(screen.getByPlaceholderText(i18n!.t('chat.search')), {
      target: { value: 'le' },
    });

    expect(screen.queryByText('ana')).not.toBeInTheDocument();
    expect(screen.getByText('leo')).toBeInTheDocument();
  });

  it('moves a conversation to the top with its new message as it arrives', async () => {
    renderWithProviders(<ConversationList />);
    await screen.findByText('ana');
    expect(order()).toEqual(['/direct/inbox/t/c1', '/direct/inbox/t/c2']);

    act(() => {
      handlers.get('receiveMessage')!({
        id: 'm-new',
        conversationId: 'c2',
        content: 'just now from leo',
        senderId: 'p-c2',
        createdAt: '2026-10-01T11:00:00.000Z',
      });
    });

    await waitFor(() =>
      expect(order()).toEqual(['/direct/inbox/t/c2', '/direct/inbox/t/c1']),
    );
    expect(screen.getByText(/just now from leo/)).toBeInTheDocument();
    // The previous message was not overwritten by the new one.
    expect(chatApi.getConversations).toHaveBeenCalledTimes(2);
  });

  it('a repeated or late event for an older message does not reorder the inbox', async () => {
    renderWithProviders(<ConversationList />);
    await screen.findByText('ana');

    act(() => {
      // Repeat of the message c2 already shows.
      handlers.get('receiveMessage')!({
        id: 'm-c2',
        conversationId: 'c2',
        content: 'second',
        senderId: 'p-c2',
        createdAt: '2026-10-01T10:00:00.000Z',
      });
      // A late event for a message older than c2's latest one.
      handlers.get('receiveMessage')!({
        id: 'm-old',
        conversationId: 'c2',
        content: 'from yesterday',
        senderId: 'p-c2',
        createdAt: '2026-09-30T10:00:00.000Z',
      });
    });

    expect(order()).toEqual(['/direct/inbox/t/c1', '/direct/inbox/t/c2']);
    expect(screen.getByText(/second/)).toBeInTheDocument();
    expect(screen.queryByText(/from yesterday/)).not.toBeInTheDocument();
  });

  it('loads a conversation it does not know yet when a message arrives for it', async () => {
    renderWithProviders(<ConversationList />);
    await screen.findByText('ana');

    act(() => {
      handlers.get('receiveMessage')!({
        id: 'm-x',
        conversationId: 'c-new',
        content: 'hi',
        senderId: 'p-new',
        createdAt: '2026-10-01T11:00:00.000Z',
      });
    });

    await waitFor(() =>
      expect(
        vi.mocked(chatApi.getConversations).mock.calls.length,
      ).toBeGreaterThan(2),
    );
  });

  it('removes a conversation deleted elsewhere', async () => {
    renderWithProviders(<ConversationList />);
    await screen.findByText('ana');

    act(() => {
      handlers.get('conversationDeleted')!({ conversationId: 'c1' });
    });

    await waitFor(() =>
      expect(screen.queryByText('ana')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('leo')).toBeInTheDocument();
  });
});
