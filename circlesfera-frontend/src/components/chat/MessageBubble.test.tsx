import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Message } from '../../types';
import MessageBubble from './MessageBubble';

const sells = vi.hoisted(() => ({ value: true }));
vi.mock('../../utils/sellsInApp', () => ({ sellsInApp: () => sells.value }));

vi.mock('../../stores/storyStore', () => ({
  useStoryStore: vi.fn(
    (selector: (state: { openStories: () => void }) => unknown) =>
      selector({ openStories: vi.fn() }),
  ),
}));

vi.mock('../UserAvatar', () => ({
  default: () => <div data-testid="user-avatar" />,
}));

vi.mock('./AudioPlayer', () => ({
  default: () => <div data-testid="audio-player" />,
}));

vi.mock('./SharedPost', () => ({
  default: () => <div data-testid="shared-post" />,
}));

vi.mock('../audio/VoicePlayer', () => ({
  VoicePlayer: () => <div data-testid="voice-player" />,
}));

function buildMessage(overrides: Record<string, unknown> = {}): Message {
  return {
    id: 'msg-1',
    content: 'Hello there',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T10:00:00Z'),
    sender: {
      id: 'user-1',
      profile: { username: 'sender', avatar: null },
    },
    ...overrides,
  } as unknown as Message;
}

describe('MessageBubble', () => {
  const onReply = vi.fn();
  const onReact = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderBubble = (
    overrides: Record<string, unknown> = {},
    props = {},
    lng: 'en' | 'es' = 'en',
  ) =>
    renderWithProviders(
      <MessageBubble
        msg={buildMessage(overrides)}
        isMe={false}
        isSeq={false}
        showAvatar
        onReply={onReply}
        onReact={onReact}
        onDelete={onDelete}
        {...props}
      />,
      { lng },
    );

  it('shows a GIF at its size, named by its title', () => {
    const { i18n } = renderBubble({
      content: '',
      gif: {
        id: 'abc123',
        title: 'Party',
        url: 'https://media.giphy.com/media/abc123/200.webp',
        width: 200,
        height: 150,
      },
    });
    const img = screen.getByRole('img', {
      name: i18n!.t('chat.gif_named', { title: 'Party' }),
    });
    expect(img).toHaveAttribute(
      'src',
      'https://media.giphy.com/media/abc123/200.webp',
    );
    expect(img).toHaveAttribute('width', '200');
    expect(img).toHaveAttribute('height', '150');
    // On its own, with no bubble around it.
    expect(img.parentElement?.parentElement).not.toHaveClass('glass-panel');
  });

  it('names a GIF with no title as a GIF', () => {
    const { i18n } = renderBubble({
      content: '',
      gif: {
        id: 'abc123',
        title: '',
        url: 'https://media.giphy.com/media/abc123/200.webp',
        width: 200,
        height: 150,
      },
    });
    expect(
      screen.getByRole('img', { name: i18n!.t('chat.gif_alt') }),
    ).toBeInTheDocument();
  });

  it('renders plain text content', () => {
    renderBubble({ content: 'Hello there' });
    expect(screen.getByText('Hello there')).toBeInTheDocument();
  });

  it('extracts the text field when content is a JSON media payload', () => {
    renderBubble({ content: JSON.stringify({ text: 'Wrapped message' }) });
    expect(screen.getByText('Wrapped message')).toBeInTheDocument();
  });

  it('shows catalog copy for deleted messages, not a Spanish fallback', () => {
    const { i18n } = renderBubble({
      content: 'secret content',
      isDeleted: true,
    });
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(i18n!.t('chat.message_deleted')).toBe('This message was deleted');
    expect(
      screen.getByText(new RegExp(i18n!.t('chat.message_deleted'))),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/este mensaje fue eliminado/i),
    ).not.toBeInTheDocument();
  });

  it('calls onReply with the message when the reply action is clicked', () => {
    const { i18n } = renderBubble();
    fireEvent.click(screen.getByTitle(i18n!.t('chat.reply')));
    expect(onReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg-1' }),
    );
  });

  it('calls onReact with the message id and emoji when a reaction is picked', () => {
    const { i18n } = renderBubble();
    fireEvent.click(screen.getByTitle(`${i18n!.t('chat.react')} ❤️`));
    expect(onReact).toHaveBeenCalledWith('msg-1', '❤️');
  });

  it('renders the delete action only for the sender own messages', () => {
    const { i18n, rerender } = renderBubble();
    expect(screen.queryByTitle(i18n!.t('chat.delete'))).not.toBeInTheDocument();

    rerender(
      <MessageBubble
        msg={buildMessage()}
        isMe
        isSeq={false}
        showAvatar
        onReply={onReply}
        onReact={onReact}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByTitle(i18n!.t('chat.delete'))).toBeInTheDocument();
  });

  it('calls onDelete with the message id when the delete action is clicked', () => {
    const { i18n } = renderBubble({}, { isMe: true });

    fireEvent.click(screen.getByTitle(i18n!.t('chat.delete')));
    expect(onDelete).toHaveBeenCalledWith('msg-1');
  });

  it('renders the shared post preview when the message references a post', () => {
    renderBubble({ post: { id: 'post-1' } });
    expect(screen.getByTestId('shared-post')).toBeInTheDocument();
  });

  it('labels a story reply preview from the catalog', () => {
    const { i18n } = renderBubble({
      storyId: 'story-1',
      story: {
        url: 'https://cdn.example.com/story.jpg',
        mediaType: 'image',
      },
    });

    expect(i18n!.t('common.alt.story')).toBe('Story');
    expect(
      screen.getByAltText(i18n!.t('common.alt.story')),
    ).toBeInTheDocument();
  });

  it('labels an image attachment from the catalog', () => {
    const { i18n } = renderBubble({
      url: 'https://cdn.example.com/photo.jpg',
      mediaType: 'image',
    });

    expect(i18n!.t('common.alt.attachment')).toBe('Attachment');
    expect(
      screen.getByAltText(i18n!.t('common.alt.attachment')),
    ).toBeInTheDocument();
  });

  it('shows a paid message nobody bought as no longer for sale, with nothing to buy', () => {
    renderBubble({ isLocked: true, priceCents: 199, content: 'secret' });

    expect(screen.getByText('Exclusive message')).toBeInTheDocument();
    expect(
      screen.getByText('This paid message is no longer for sale.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /€/ })).not.toBeInTheDocument();
  });

  it('labels edited and delivery state from the catalog for own messages', () => {
    const { i18n } = renderBubble(
      { content: 'edited body', isEdited: true },
      { isMe: true, isRead: true },
    );

    expect(
      screen.getByText(new RegExp(`\\(${i18n!.t('chat.edited')}\\)`)),
    ).toBeInTheDocument();
    expect(screen.getByTitle(i18n!.t('chat.read'))).toBeInTheDocument();
    expect(screen.queryByTitle('Leído')).not.toBeInTheDocument();
  });

  it('uses delivered title when the own message is unread by peers', () => {
    const { i18n } = renderBubble(
      { content: 'pending' },
      { isMe: true, isRead: false },
    );

    expect(screen.getByTitle(i18n!.t('chat.delivered'))).toBeInTheDocument();
  });

  it('names someone in a block with the viewer as unavailable, in a reply too', () => {
    const { i18n } = renderBubble({
      sender: { id: 'b', username: null, avatar: null, unavailable: true },
      replyTo: {
        id: 'r1',
        content: 'x',
        sender: { id: 'b', username: null, unavailable: true },
      },
    });

    expect(
      screen.getByText(
        i18n!.t('chat.replying_to_user', {
          username: i18n!.t('chat.unavailable_user'),
        }),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bob/)).not.toBeInTheDocument();
  });

  describe('forwarding', () => {
    it('offers Forward on a text and passes the message on', () => {
      const onForward = vi.fn();
      renderBubble({ content: 'Hello there' }, { onForward });
      fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
      expect(onForward).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'msg-1' }),
      );
    });

    it.each([
      ['a file', { url: 'https://cdn/x.jpg' }],
      ['a voice note', { voiceUrl: 'https://cdn/x.m4a' }],
      ['a paid message', { isLocked: true }],
      ['a deleted message', { isDeleted: true }],
      ['a notice', { kind: 'ADMIN_GRANTED' }],
    ])('does not offer it on %s', (_name, overrides) => {
      renderBubble(overrides, { onForward: vi.fn() });
      expect(
        screen.queryByRole('button', { name: 'Forward' }),
      ).not.toBeInTheDocument();
    });

    it('marks a forwarded copy', () => {
      renderBubble({ isForwarded: true }, {}, 'es');
      expect(screen.getByText('Reenviado')).toBeInTheDocument();
    });
  });
});
