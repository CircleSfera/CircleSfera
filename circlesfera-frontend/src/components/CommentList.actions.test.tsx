import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commentsApi, uploadApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import type { Comment } from '../types';
import CommentList from './CommentList';

const native = vi.hoisted(() => ({ pick: vi.fn() }));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
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
  uploadApi: { upload: vi.fn() },
}));
vi.mock('../utils/nativeFilePicker', () => ({ pickNativeImage: native.pick }));
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('./audio/VoiceRecorder', () => ({
  VoiceRecorder: ({ onSendVoice }: { onSendVoice: (data: object) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSendVoice({
          voiceUrl: 'v.webm',
          voiceDuration: 3,
          voiceWaveform: [0.5],
        })
      }
    >
      record
    </button>
  ),
}));
vi.mock('./audio/VoicePlayer', () => ({
  VoicePlayer: ({ voiceUrl }: { voiceUrl: string }) => (
    <div>voice {voiceUrl}</div>
  ),
}));
vi.mock('./UserAvatar', () => ({ default: () => null }));
vi.mock('./modals/ConfirmModal', () => ({
  default: ({
    isOpen,
    onClose,
    onConfirm,
    title,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <button type="button" onClick={onConfirm}>
          confirm
        </button>
        <button type="button" onClick={onClose}>
          keep
        </button>
      </div>
    ) : null,
}));

const comment = (id: string, over: Partial<Comment> = {}): Comment =>
  ({
    id,
    content: `Comment ${id}`,
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
    ...over,
  }) as Comment;

const show = (comments: Comment[] = [comment('c1')], props: object = {}) =>
  renderWithProviders(
    <CommentList postId="post-1" comments={comments} {...props} />,
  );
const field = () => screen.getByRole('textbox');
const post = () => screen.getByRole('button', { name: 'Post' });
const write = (text: string) =>
  fireEvent.change(field(), { target: { value: text } });

describe('CommentList actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.pick.mockResolvedValue(false);
    vi.mocked(commentsApi.create).mockResolvedValue({} as never);
  });

  it('invites the first comment on a post with none', () => {
    show([]);
    expect(
      screen.getByText('No comments yet. Be the first to comment!'),
    ).toBeInTheDocument();
  });

  describe('writing a comment', () => {
    it('posts it and empties the field', async () => {
      show();
      expect(post()).toBeDisabled();

      write('Lovely light');
      fireEvent.click(post());

      await waitFor(() => expect(field()).toHaveValue(''));
      expect(commentsApi.create).toHaveBeenCalledWith('post-1', {
        content: 'Lovely light',
        parentId: undefined,
        url: undefined,
        mediaType: undefined,
      });
    });

    it('does not post an empty comment', () => {
      show();
      write('   ');
      fireEvent.submit(field());
      expect(commentsApi.create).not.toHaveBeenCalled();
    });

    it('keeps what was written and says so when it could not be posted', async () => {
      vi.mocked(commentsApi.create).mockRejectedValue(new Error('down'));
      show();

      write('Lovely light');
      fireEvent.submit(field());

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Your comment could not be posted. Try again.',
        ),
      );
      expect(field()).toHaveValue('Lovely light');
    });
  });

  describe('replying', () => {
    it('answers a comment under that comment, and can be called off', async () => {
      show();

      fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
      expect(screen.getByText('Replying to')).toBeInTheDocument();
      expect(field()).toHaveAttribute('placeholder', 'Reply to @alice...');
      expect(field()).toHaveValue('');
      expect(field()).toHaveFocus();

      write('Thanks!');
      fireEvent.submit(field());
      await waitFor(() =>
        expect(commentsApi.create).toHaveBeenCalledWith(
          'post-1',
          expect.objectContaining({ content: 'Thanks!', parentId: 'c1' }),
        ),
      );
      await waitFor(() =>
        expect(screen.queryByText('Replying to')).not.toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Replying to')).not.toBeInTheDocument();
    });

    const thread = [
      comment('c1', {
        replies: [
          comment('r1', {
            parentId: 'c1',
            profile: {
              id: 'p2',
              username: 'ben',
              avatar: null,
              fullName: 'Ben',
            } as never,
          }),
        ],
      }),
    ];

    it('answers a reply under the comment it belongs to, naming who is answered', async () => {
      show(thread);

      fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[1]);
      expect(field()).toHaveValue('@ben ');

      write('@ben agreed');
      fireEvent.submit(field());

      await waitFor(() =>
        expect(commentsApi.create).toHaveBeenCalledWith(
          'post-1',
          expect.objectContaining({ content: '@ben agreed', parentId: 'c1' }),
        ),
      );
    });

    it('sends a voice note the same way: under the comment the reply belongs to', async () => {
      show(thread);

      fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[1]);
      fireEvent.click(screen.getByRole('button', { name: 'record' }));

      await waitFor(() =>
        expect(commentsApi.create).toHaveBeenCalledWith('post-1', {
          content: '🎤 Voice note',
          parentId: 'c1',
          voiceUrl: 'v.webm',
          voiceDuration: 3,
          voiceWaveform: [0.5],
        }),
      );
    });
  });

  describe('a picture or a video with the comment', () => {
    const choose = (
      container: HTMLElement,
      file = new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    ) =>
      fireEvent.change(
        container.querySelector('input[type="file"]') as HTMLInputElement,
        {
          target: { files: [file] },
        },
      );

    it('uploads the chosen file, shows it, and posts the comment with it', async () => {
      vi.mocked(uploadApi.upload).mockResolvedValue({
        data: { url: 'up.jpg', type: 'image' },
      } as never);
      const { container } = show();

      choose(container);

      expect(
        await screen.findByRole('img', { name: /preview/i }),
      ).toHaveAttribute('src', 'up.jpg');
      expect(post()).toBeEnabled();
      fireEvent.click(post());
      await waitFor(() =>
        expect(commentsApi.create).toHaveBeenCalledWith('post-1', {
          content: '',
          parentId: undefined,
          url: 'up.jpg',
          mediaType: 'image',
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('img', { name: /preview/i }),
        ).not.toBeInTheDocument(),
      );
    });

    it('takes the file away again', async () => {
      vi.mocked(uploadApi.upload).mockResolvedValue({
        data: { url: 'up.jpg', type: 'image' },
      } as never);
      const { container } = show();
      choose(container);
      await screen.findByRole('img', { name: /preview/i });

      fireEvent.click(screen.getByRole('button', { name: 'Remove the file' }));

      expect(
        screen.queryByRole('img', { name: /preview/i }),
      ).not.toBeInTheDocument();
      expect(post()).toBeDisabled();
    });

    it('says so when the file could not be uploaded', async () => {
      vi.mocked(uploadApi.upload).mockRejectedValue(new Error('too big'));
      const { container } = show();

      choose(container);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Failed to upload media'),
      );
      expect(
        screen.queryByRole('img', { name: /preview/i }),
      ).not.toBeInTheDocument();
    });

    it('does nothing when the picker is closed without a file', () => {
      const { container } = show();
      fireEvent.change(
        container.querySelector('input[type="file"]') as HTMLInputElement,
        {
          target: { files: [] },
        },
      );
      expect(uploadApi.upload).not.toHaveBeenCalled();
    });

    it('opens the picker of the browser, unless the device has shown its own', async () => {
      const { container } = show();
      const input = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const click = vi.spyOn(input, 'click');

      fireEvent.click(screen.getByRole('button', { name: 'Add media' }));
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

      native.pick.mockResolvedValue(true);
      fireEvent.click(screen.getByRole('button', { name: 'Add media' }));
      await waitFor(() => expect(native.pick).toHaveBeenCalledTimes(2));
      expect(click).toHaveBeenCalledTimes(1);
    });
  });

  describe('liking', () => {
    it('likes a comment and takes the like back', async () => {
      vi.mocked(commentsApi.like).mockResolvedValue({} as never);
      vi.mocked(commentsApi.unlike).mockResolvedValue({} as never);
      const first = show();
      fireEvent.click(screen.getByRole('button', { name: 'Like' }));
      await waitFor(() =>
        expect(commentsApi.like).toHaveBeenCalledWith('post-1', 'c1'),
      );
      first.unmount();

      show([
        comment('c1', {
          likes: [{ profileId: 'me' }] as never,
          _count: { likes: 1 } as never,
        }),
      ]);
      fireEvent.click(screen.getByRole('button', { name: 'Unlike' }));
      await waitFor(() =>
        expect(commentsApi.unlike).toHaveBeenCalledWith('post-1', 'c1'),
      );
    });

    it('says so when the like could not be saved', async () => {
      vi.mocked(commentsApi.like).mockRejectedValue(new Error('down'));
      show();
      fireEvent.click(screen.getByRole('button', { name: 'Like' }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'The like could not be saved.',
        ),
      );
    });

    it('counts one like in the singular and several in the plural', () => {
      const one = show([comment('c1', { _count: { likes: 1 } as never })]);
      expect(screen.getByText('1 like')).toBeInTheDocument();
      one.unmount();

      show([comment('c1', { _count: { likes: 5 } as never })]);
      expect(screen.getByText('5 likes')).toBeInTheDocument();
    });
  });

  describe('deleting', () => {
    const mine = [comment('c1', { profileId: 'me' })];
    const dialog = () => screen.getByRole('dialog', { name: 'Delete Comment' });

    it('offers it only on the person’s own comments', () => {
      show();
      expect(
        screen.queryByRole('button', { name: 'Delete' }),
      ).not.toBeInTheDocument();
    });

    it('deletes after asking', async () => {
      vi.mocked(commentsApi.delete).mockResolvedValue({} as never);
      show(mine);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'confirm' }),
      );

      await waitFor(() =>
        expect(commentsApi.delete).toHaveBeenCalledWith('post-1', 'c1'),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    });

    it('deletes nothing when the answer is no', () => {
      show(mine);
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      fireEvent.click(within(dialog()).getByRole('button', { name: 'keep' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(commentsApi.delete).not.toHaveBeenCalled();
    });

    it('closes the question and says so when the comment could not be deleted', async () => {
      vi.mocked(commentsApi.delete).mockRejectedValue(new Error('down'));
      show(mine);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'confirm' }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'The comment could not be deleted.',
        ),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Comment c1')).toBeInTheDocument();
    });
  });

  describe('what a comment shows', () => {
    it('shows a picture, a video or a voice note that came with it', () => {
      const { container } = show([
        comment('c1', { url: 'pic.jpg', mediaType: 'image' } as never),
        comment('c2', { url: 'clip.mp4', mediaType: 'video' } as never),
        comment('c3', { voiceUrl: 'note.webm', voiceDuration: 4 } as never),
      ]);

      expect(container.querySelector('img[src="pic.jpg"]')).not.toBeNull();
      expect(container.querySelector('video[src="clip.mp4"]')).not.toBeNull();
      expect(screen.getByText('voice note.webm')).toBeInTheDocument();
    });

    it('lays out the page of a post with its caption and actions around the comments', () => {
      show([comment('c1')], {
        isDetailMode: true,
        captionComponent: <p>the caption</p>,
        actionsComponent: <p>the actions</p>,
      });

      expect(screen.getByText('the caption')).toBeInTheDocument();
      expect(screen.getByText('the actions')).toBeInTheDocument();
      expect(field()).toHaveAttribute('placeholder', 'Comment…');
    });

    it('invites the first comment inside a frame too', () => {
      show([], { frameContext: true, compactComposer: true });
      expect(
        screen.getByText('No comments yet. Be the first to comment!'),
      ).toBeInTheDocument();
    });
  });
});
