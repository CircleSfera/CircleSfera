import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types';
import MessageBubble from './MessageBubble';

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

  const renderBubble = (overrides: Record<string, unknown> = {}, props = {}) =>
    render(
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
    );

  it('renders plain text content', () => {
    renderBubble({ content: 'Hello there' });
    expect(screen.getByText('Hello there')).toBeInTheDocument();
  });

  it('extracts the text field when content is a JSON media payload', () => {
    renderBubble({ content: JSON.stringify({ text: 'Wrapped message' }) });
    expect(screen.getByText('Wrapped message')).toBeInTheDocument();
  });

  it('shows a placeholder for deleted messages instead of the content', () => {
    renderBubble({ content: 'secret content', isDeleted: true });
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(screen.getByText(/mensaje fue eliminado/i)).toBeInTheDocument();
  });

  it('calls onReply with the message when the reply action is clicked', () => {
    renderBubble();
    fireEvent.click(screen.getByTitle('Reply'));
    expect(onReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg-1' }),
    );
  });

  it('calls onReact with the message id and emoji when a reaction is picked', () => {
    renderBubble();
    fireEvent.click(screen.getByTitle('Reaccionar ❤️'));
    expect(onReact).toHaveBeenCalledWith('msg-1', '❤️');
  });

  it('renders the delete action only for the sender own messages', () => {
    const { rerender } = render(
      <MessageBubble
        msg={buildMessage()}
        isMe={false}
        isSeq={false}
        showAvatar
        onReply={onReply}
        onReact={onReact}
        onDelete={onDelete}
      />,
    );
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();

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
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('calls onDelete with the message id when the delete action is clicked', () => {
    render(
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

    fireEvent.click(screen.getByTitle('Delete'));
    expect(onDelete).toHaveBeenCalledWith('msg-1');
  });

  it('renders the shared post preview when the message references a post', () => {
    renderBubble({ post: { id: 'post-1' } });
    expect(screen.getByTestId('shared-post')).toBeInTheDocument();
  });
});
