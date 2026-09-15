import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commentsApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import type { Comment } from '../types';
import CommentList from './CommentList';

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: { profile: { id: string } }) => unknown) =>
    selector({ profile: { id: 'me' } }),
}));

vi.mock('../services', () => ({
  commentsApi: {
    create: vi.fn(),
    delete: vi.fn(),
    like: vi.fn(),
    unlike: vi.fn(),
  },
  uploadApi: {
    upload: vi.fn(),
  },
}));

vi.mock('./audio/VoiceRecorder', () => ({
  VoiceRecorder: ({
    onSendVoice,
  }: {
    onSendVoice: (data: {
      voiceUrl: string;
      voiceDuration: number;
      voiceWaveform: number[];
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="voice-recorder"
      onClick={() =>
        onSendVoice({
          voiceUrl: 'https://cdn.example.com/v.ogg',
          voiceDuration: 1.5,
          voiceWaveform: [0.1, 0.2],
        })
      }
    >
      record
    </button>
  ),
}));

vi.mock('./audio/VoicePlayer', () => ({
  VoicePlayer: () => <div data-testid="voice-player" />,
}));

vi.mock('./UserAvatar', () => ({
  default: () => <div data-testid="user-avatar" />,
}));

vi.mock('./modals/ConfirmModal', () => ({
  default: () => null,
}));

function buildComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    content: 'Hello comment',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    profileId: 'other',
    postId: 'post-1',
    profile: {
      id: 'other',
      username: 'alice',
      avatar: null,
      fullName: 'Alice',
    },
    likes: [],
    _count: { likes: 0 },
    ...overrides,
  } as Comment;
}

describe('CommentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('labels like/reply actions from the catalog, not Spanish fallbacks', () => {
    const { i18n } = renderWithProviders(
      <CommentList postId="post-1" comments={[buildComment()]} />,
    );

    expect(i18n!.t('comments.like')).toBe('Like');
    expect(i18n!.t('comments.reply')).toBe('Reply');
    expect(
      screen.getByRole('button', { name: i18n!.t('comments.like') }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: i18n!.t('comments.reply') }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Me gusta')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Responder')).not.toBeInTheDocument();
  });

  it('shows unlike and delete from the catalog for the owner when liked', () => {
    const { i18n } = renderWithProviders(
      <CommentList
        postId="post-1"
        comments={[
          buildComment({
            profileId: 'me',
            profile: {
              id: 'me',
              username: 'me',
              avatar: null,
              fullName: 'Me',
            } as never,
            likes: [{ id: 'like-1' } as never],
            _count: { likes: 1, replies: 0 },
          }),
        ]}
      />,
    );

    expect(i18n!.t('comments.unlike')).toBe('Unlike');
    expect(i18n!.t('comments.delete')).toBe('Delete');
    expect(
      screen.getByRole('button', { name: i18n!.t('comments.unlike') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('comments.delete') }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Ya no me gusta')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Eliminar comentario'),
    ).not.toBeInTheDocument();
  });

  it('uses compact placeholder and add-media label from the catalog', () => {
    const { i18n } = renderWithProviders(
      <CommentList postId="post-1" comments={[]} compactComposer />,
    );

    expect(i18n!.t('comments.add_comment_short')).toBe('Comment…');
    expect(i18n!.t('comments.add_media')).toBe('Add media');
    expect(
      screen.getByPlaceholderText(i18n!.t('comments.add_comment_short')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('comments.add_media') }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Comentar…')).not.toBeInTheDocument();
  });

  it('sends voice comments with catalog voice_note content, not Spanish', async () => {
    vi.mocked(commentsApi.create).mockResolvedValue({} as never);

    const { i18n } = renderWithProviders(
      <CommentList postId="post-1" comments={[]} />,
    );

    fireEvent.click(screen.getByTestId('voice-recorder'));

    await waitFor(() => {
      expect(commentsApi.create).toHaveBeenCalledWith(
        'post-1',
        expect.objectContaining({
          content: i18n!.t('comments.voice_note'),
          voiceUrl: 'https://cdn.example.com/v.ogg',
        }),
      );
    });
    expect(i18n!.t('comments.voice_note')).toBe('🎤 Voice note');
    expect(commentsApi.create).not.toHaveBeenCalledWith(
      'post-1',
      expect.objectContaining({ content: '🎤 Nota de voz' }),
    );
  });
});
