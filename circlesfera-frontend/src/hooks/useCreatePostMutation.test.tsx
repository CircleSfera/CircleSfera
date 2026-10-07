import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interactiveApi, postsApi, storiesApi } from '../services';
import { createTestI18n, createTestQueryClient } from '../test/test-utils';
import { useCreatePostMutation } from './useCreatePostMutation';
import type { MediaFile } from './useCreatePostState';

vi.mock('../services', () => ({
  postsApi: { create: vi.fn() },
  storiesApi: { create: vi.fn() },
  interactiveApi: { createPoll: vi.fn(), createQna: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('../utils/imageExport', () => ({ exportEditedImage: vi.fn() }));
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { exportEditedImage } from '../utils/imageExport';

const i18n = createTestI18n('en');
const image = (name = 'a.jpg', size = 1000): MediaFile => ({
  file: new File([new Uint8Array(size)], name, { type: 'image/jpeg' }),
  url: 'blob:a',
  type: 'image',
});
const UPLOADED = [
  {
    url: 'https://cdn/a.jpg',
    standardUrl: 'https://cdn/a-std.jpg',
    thumbnailUrl: 'https://cdn/a-th.jpg',
    type: 'image',
  },
];

function setup(overrides: Record<string, unknown> = {}) {
  const deps = {
    mode: 'POST',
    caption: 'Hola',
    hideLikes: false,
    turnOffComments: true,
    isSensitive: false,
    location: '',
    selectedPlace: null,
    selectedAudio: null,
    audioStartMs: 4000,
    isCloseFriendsOnly: false,
    isPremium: false,
    price: 0,
    scheduledAt: '',
    interactiveDraft: null,
    storyElements: [],
    mediaFiles: [image()],
    altTextMap: {},
    tagsMap: {},
    isProcessingEdit: false,
    setIsProcessingEdit: vi.fn(),
    uploadFiles: vi.fn().mockResolvedValue(UPLOADED),
    setShowFrameTrim: vi.fn(),
    ...overrides,
  };
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useCreatePostMutation(deps as never), {
    wrapper,
  });
  return { deps, submit: () => act(() => result.current.handleSubmit()) };
}

describe('useCreatePostMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postsApi.create).mockResolvedValue({
      data: { id: 'post-1' },
    } as never);
    vi.mocked(storiesApi.create).mockResolvedValue({
      data: { id: 'story-1' },
    } as never);
  });

  it('does nothing without media', async () => {
    const { deps, submit } = setup({ mediaFiles: [] });
    await submit();
    expect(deps.uploadFiles).not.toHaveBeenCalled();
  });

  it('refuses a caption over 2200 characters before uploading', async () => {
    const { deps, submit } = setup({ caption: 'x'.repeat(2201) });
    await submit();
    expect(toast.error).toHaveBeenCalledWith(
      i18n.t('createPost.caption.too_long'),
    );
    expect(deps.uploadFiles).not.toHaveBeenCalled();
  });

  it('refuses files over the upload limit before uploading', async () => {
    const big = image('big.jpg');
    Object.defineProperty(big.file, 'size', { value: 101 * 1024 * 1024 });
    const { deps, submit } = setup({ mediaFiles: [big] });
    await submit();
    expect(toast.error).toHaveBeenCalledWith(
      i18n.t('createPost.upload.file_too_large', {
        name: 'big.jpg',
        maxMb: 100,
      }),
    );
    expect(deps.uploadFiles).not.toHaveBeenCalled();
  });

  it('a Frame needs a video clip of an allowed length', async () => {
    const photo = setup({ mode: 'FRAME' });
    await photo.submit();
    expect(toast.error).toHaveBeenCalledWith(
      i18n.t('createPost.upload.frame_video_only'),
    );

    const short = setup({
      mode: 'FRAME',
      mediaFiles: [
        {
          ...image('clip.mp4'),
          type: 'video',
          videoData: { startTime: 0, endTime: 5 },
        },
      ],
    });
    await short.submit();
    expect(short.deps.setShowFrameTrim).toHaveBeenCalledWith(true);
    expect(short.deps.uploadFiles).not.toHaveBeenCalled();
  });

  it('publishes a post with the price in cents, tags and rating, then goes home', async () => {
    const { deps, submit } = setup({
      isPremium: true,
      price: 4.99,
      isSensitive: true,
      tagsMap: { 0: [{ profileId: 'p9', username: 'ana', x: 0.2, y: 0.4 }] },
      scheduledAt: '2026-11-01T10:00:00.000Z',
    });
    await submit();

    expect(postsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: 'Hola',
        turnOffComments: true,
        media: UPLOADED,
        type: 'POST',
        audioStartMs: 0,
        tags: [{ profileId: 'p9', x: 0.2, y: 0.4 }],
        isPremium: true,
        priceCents: 499,
        contentRating: 'MATURE',
        scheduledAt: '2026-11-01T10:00:00.000Z',
      }),
    );
    expect(navigate).toHaveBeenCalledWith('/');
    expect(deps.setIsProcessingEdit).toHaveBeenLastCalledWith(false);
  });

  it('a free post never sends a price', async () => {
    const { submit } = setup({ isPremium: false, price: 9 });
    await submit();
    expect(postsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ isPremium: false, priceCents: 0 }),
    );
  });

  it('adds the poll after the post, and still goes home if the poll fails', async () => {
    vi.mocked(interactiveApi.createPoll).mockRejectedValue(new Error('x'));
    const { submit } = setup({
      interactiveDraft: { kind: 'poll', question: 'Q?', options: ['a', 'b'] },
    });
    await submit();

    expect(interactiveApi.createPoll).toHaveBeenCalledWith({
      question: 'Q?',
      options: ['a', 'b'],
      postId: 'post-1',
    });
    expect(toast.error).toHaveBeenCalledWith(
      i18n.t('createPost.interactive.poll_create_failed'),
    );
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('publishes a story for each file with its poll', async () => {
    const { submit } = setup({
      mode: 'STORY',
      isCloseFriendsOnly: true,
      storyElements: [
        {
          type: 'poll',
          content: JSON.stringify({ question: 'Q?', options: ['a', 'b'] }),
        },
      ],
    });
    await submit();

    expect(storiesApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cdn/a.jpg',
        mediaType: 'image',
        isCloseFriendsOnly: true,
        priceCents: 0,
      }),
    );
    expect(interactiveApi.createPoll).toHaveBeenCalledWith({
      question: 'Q?',
      options: ['a', 'b'],
      storyId: 'story-1',
    });
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('says the edit could not be applied, in the app language', async () => {
    vi.mocked(exportEditedImage).mockRejectedValue(new Error('canvas'));
    const { deps, submit } = setup({
      mediaFiles: [{ ...image(), filter: 'sepia' }],
    });
    await submit();

    expect(toast.error).toHaveBeenCalledWith(
      i18n.t('createPost.upload.edit_export_error'),
    );
    expect(deps.uploadFiles).not.toHaveBeenCalled();
    expect(deps.setIsProcessingEdit).toHaveBeenLastCalledWith(false);
  });

  it('shows its own message, never the server text, when publishing fails', async () => {
    vi.mocked(postsApi.create).mockRejectedValue(
      new Error('Internal: column "x" does not exist'),
    );
    const { submit } = setup();
    await submit();

    expect(toast.error).toHaveBeenCalledWith(
      i18n.t('createPost.upload.publish_failed'),
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringContaining('column'),
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
