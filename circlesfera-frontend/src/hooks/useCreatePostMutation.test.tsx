import { DEFAULT_POST_SHAPE, POST_SHAPES } from '@circlesfera/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assembleFrame } from '../components/create-post/frameAssembly';
import { buildHashtagElement } from '../components/story/storyComposer.append';
import { FRAME_MIN_DURATION_SEC } from '../constants/uploadLimits';
import { interactiveApi, postsApi, storiesApi } from '../services';
import { studioTemplatesApi } from '../services/studioTemplates.service';
import { createTestI18n, createTestQueryClient } from '../test/test-utils';
import { exportEditedImage } from '../utils/imageExport';
import { exportEditedVideo } from '../utils/videoExport';
import { useCreatePostMutation } from './useCreatePostMutation';
import type { MediaFile } from './useCreatePostState';

vi.mock('../services', () => ({
  postsApi: { create: vi.fn() },
  storiesApi: { create: vi.fn() },
  interactiveApi: { createPoll: vi.fn(), createQna: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('../utils/imageExport', () => ({ exportEditedImage: vi.fn() }));
vi.mock('../utils/videoExport', () => ({
  exportEditedVideo: vi.fn(async (file: File) => file),
}));
vi.mock('../components/create-post/frameAssembly', () => ({
  assembleFrame: vi.fn(async () => ({
    url: '/uploads/frame.mp4',
    file: new File([new Uint8Array(4)], 'frame.mp4', { type: 'video/mp4' }),
  })),
}));
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('../services/studioTemplates.service', () => ({
  studioTemplatesApi: { create: vi.fn().mockResolvedValue({ data: {} }) },
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

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
    postShape: DEFAULT_POST_SHAPE,
    caption: 'Hola',
    hideLikes: false,
    turnOffComments: true,
    coverTimeMs: null,
    isSensitive: false,
    location: '',
    selectedPlace: null,
    selectedAudio: null,
    audioStartMs: 4000,
    isCloseFriendsOnly: false,
    scheduledAt: '',
    interactiveDraft: null,
    storyElements: [],
    storyCanvasSize: null,
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

  it('sends a song already mixed into a Studio video so it counts, keeping the video sound', async () => {
    const { submit } = setup({
      songInVideo: { id: 'song-1', startMs: 1500 },
    });
    await submit();
    expect(postsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audioId: 'song-1',
        audioStartMs: 1500,
        audioInVideo: true,
      }),
    );
  });

  it('plays a song chosen in the composer over the video, even with one from the Studio', async () => {
    const { submit } = setup({
      selectedAudio: { id: 'chosen' },
      audioStartMs: 2000,
      songInVideo: { id: 'song-1', startMs: 1500 },
    });
    await submit();
    const sent = vi.mocked(postsApi.create).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(sent).toMatchObject({ audioId: 'chosen', audioStartMs: 2000 });
    expect(sent.audioInVideo).toBeUndefined();
  });

  describe('a Frame made in the Studio', () => {
    const structure = {
      version: 1,
      name: 'Trip',
      aspectRatio: '9:16',
      slots: [{ duration: 2, speed: 1 }],
      effects: [],
    };
    const frame = (over: Record<string, unknown> = {}) =>
      setup({
        mode: 'FRAME',
        mediaFiles: [
          {
            ...image('clip.mp4'),
            type: 'video',
            videoData: { startTime: 0, endTime: 20 },
          },
        ],
        studioTemplate: { name: 'Trip', structure, usedId: 'tpl-used' },
        ...over,
      });

    it('credits the template it was made with', async () => {
      const { submit } = frame();
      await submit();
      expect(postsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: 'tpl-used' }),
      );
      expect(studioTemplatesApi.create).not.toHaveBeenCalled();
    });

    it('offers its own template from the Frame when its author turns that on', async () => {
      const { submit } = frame({ offerTemplate: true });
      await submit();
      expect(studioTemplatesApi.create).toHaveBeenCalledWith({
        name: 'Trip',
        structure,
        postId: 'post-1',
        isPublic: true,
      });
    });

    it('still publishes when its template cannot be offered', async () => {
      vi.mocked(studioTemplatesApi.create).mockRejectedValueOnce(
        new Error('down'),
      );
      const { submit } = frame({ offerTemplate: true });
      await submit();
      expect(postsApi.create).toHaveBeenCalled();
    });

    it('neither credits nor offers outside a Frame', async () => {
      const { submit } = frame({ mode: 'POST', offerTemplate: true });
      await submit();
      const sent = vi.mocked(postsApi.create).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(sent.templateId).toBeUndefined();
      expect(studioTemplatesApi.create).not.toHaveBeenCalled();
    });
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

  it('refuses a story with more stickers than the server takes, before uploading', async () => {
    const { deps, submit } = setup({
      mode: 'STORY',
      storyCanvasSize: { width: 360, height: 640 },
      storyElements: Array.from({ length: 11 }, () =>
        buildHashtagElement('verano'),
      ),
    });
    await submit();
    expect(toast.error).toHaveBeenCalledWith(
      i18n.t('createPost.storyComposer.stickers_limit', { max: 10 }),
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

  describe('the cover of a frame', () => {
    const clip = {
      ...image('clip.mp4'),
      type: 'video',
      videoData: { startTime: 0, endTime: 20 },
    };

    it('is sent as the moment its author chose', async () => {
      const { submit } = setup({
        mode: 'FRAME',
        mediaFiles: [clip],
        coverTimeMs: 4200,
      });
      await submit();

      expect(postsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'FRAME', coverTimeMs: 4200 }),
      );
    });

    it('is sent at the very start of the video too', async () => {
      const { submit } = setup({
        mode: 'FRAME',
        mediaFiles: [clip],
        coverTimeMs: 0,
      });
      await submit();

      expect(postsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ coverTimeMs: 0 }),
      );
    });

    it('is left to the server when none was chosen', async () => {
      const { submit } = setup({ mode: 'FRAME', mediaFiles: [clip] });
      await submit();

      expect(postsApi.create).toHaveBeenCalled();
      expect(vi.mocked(postsApi.create).mock.calls[0][0]).not.toHaveProperty(
        'coverTimeMs',
      );
    });

    it('sends an image chosen as the cover, uploaded, in place of a moment', async () => {
      const cover = new File(['jpg'], 'frame-cover.jpg', {
        type: 'image/jpeg',
      });
      const { deps, submit } = setup({
        mode: 'FRAME',
        mediaFiles: [clip],
        coverTimeMs: 4200,
        coverImage: cover,
      });
      vi.mocked(deps.uploadFiles)
        .mockResolvedValueOnce(UPLOADED)
        .mockResolvedValueOnce([{ url: '/uploads/cover.jpg', type: 'image' }]);
      await submit();

      expect(deps.uploadFiles).toHaveBeenLastCalledWith(
        [{ file: cover, url: '', type: 'image' }],
        {},
      );
      const sent = vi.mocked(postsApi.create).mock.calls[0][0];
      expect(sent).toMatchObject({ coverImageUrl: '/uploads/cover.jpg' });
      expect(sent).not.toHaveProperty('coverTimeMs');
    });

    it('sends no cover image for a post', async () => {
      const { deps, submit } = setup({
        coverImage: new File(['jpg'], 'c.jpg', { type: 'image/jpeg' }),
      });
      await submit();

      expect(deps.uploadFiles).toHaveBeenCalledTimes(1);
      expect(vi.mocked(postsApi.create).mock.calls[0][0]).not.toHaveProperty(
        'coverImageUrl',
      );
    });

    it('has a Frame from the gallery put together by the server, not re-encoded on the phone', async () => {
      const { deps, submit } = setup({
        mode: 'FRAME',
        mediaFiles: [
          {
            ...clip,
            videoData: { startTime: 1.5, endTime: 21.5, muted: true },
            filter:
              'filter-class:grayscale brightness-110 contrast-110__style:brightness(100%) contrast(100%) saturate(100%) sepia(0%) grayscale(0%) hue-rotate(0deg) blur(0px)__temp:100__vignette:0__noise:0',
          },
        ],
      });
      await submit();

      expect(exportEditedVideo).not.toHaveBeenCalled();
      expect(assembleFrame).toHaveBeenCalledWith(
        [
          {
            file: clip.file,
            startMs: 1500,
            endMs: 21_500,
            ms: 21_500,
          },
        ],
        {
          layer: null,
          look: { grayscale: 100, brightness: 110, contrast: 110 },
          muted: true,
        },
        expect.any(Function),
      );
      // The server's video is published as it is, not sent again.
      const sent = vi.mocked(deps.uploadFiles).mock.calls[0][0][0];
      expect(sent).toMatchObject({
        remoteUrl: '/uploads/frame.mp4',
        assembledFrame: true,
      });
    });

    it('stops, saying so, when the server cannot put the Frame together', async () => {
      vi.mocked(assembleFrame).mockRejectedValueOnce(new Error('failed'));
      const { submit } = setup({ mode: 'FRAME', mediaFiles: [clip] });
      await submit();

      expect(postsApi.create).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
    });

    it('is never sent for a post', async () => {
      const { submit } = setup({ coverTimeMs: 4200 });
      await submit();

      expect(vi.mocked(postsApi.create).mock.calls[0][0]).not.toHaveProperty(
        'coverTimeMs',
      );
    });
  });

  it('publishes a post with its tags and rating, then goes home', async () => {
    const { deps, submit } = setup({
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
        contentRating: 'MATURE',
        scheduledAt: '2026-11-01T10:00:00.000Z',
      }),
    );
    expect(navigate).toHaveBeenCalledWith('/');
    expect(deps.setIsProcessingEdit).toHaveBeenLastCalledWith(false);
  });

  it('sends the shape of a post, and none for a Frame', async () => {
    const [, shape] = POST_SHAPES;
    const post = setup({ postShape: shape });
    await post.submit();
    expect(vi.mocked(postsApi.create).mock.calls.at(-1)?.[0]).toMatchObject({
      shape,
    });

    const frame = setup({
      mode: 'FRAME',
      postShape: shape,
      mediaFiles: [
        {
          ...image('clip.mp4'),
          type: 'video',
          videoData: { startTime: 0, endTime: FRAME_MIN_DURATION_SEC },
        },
      ],
    });
    await frame.submit();
    expect(
      vi.mocked(postsApi.create).mock.calls.at(-1)?.[0],
    ).not.toHaveProperty('shape');
  });

  describe('also shared to the story of its author', () => {
    const card = { id: 'post-1', profile: { username: 'ana' }, media: [] };

    it('opens the story editor with a card of the post once it is out', async () => {
      vi.mocked(postsApi.create).mockResolvedValue({ data: card } as never);
      const { submit } = setup({ shareToStory: true });
      await submit();

      const [[to, options]] = navigate.mock.calls;
      expect(to).toBe('/create?mode=story');
      const [element] = options.state.storyStart.elements;
      expect(JSON.stringify(element)).toContain('post-1');
    });

    it('goes home as any post does when it is not out yet, or cannot be shared', async () => {
      vi.mocked(postsApi.create).mockResolvedValue({ data: card } as never);
      await setup({
        shareToStory: true,
        // Any moment still to come.
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      }).submit();
      expect(navigate).toHaveBeenLastCalledWith('/');

      vi.mocked(postsApi.create).mockResolvedValue({
        data: { ...card, archivedAt: '2026-10-01' },
      } as never);
      await setup({ shareToStory: true }).submit();
      expect(navigate).toHaveBeenLastCalledWith('/');
    });

    it('goes home for a Frame, even with the switch left on from a post', async () => {
      vi.mocked(postsApi.create).mockResolvedValue({
        data: { ...card, type: 'FRAME' },
      } as never);
      await setup({
        mode: 'FRAME',
        shareToStory: true,
        mediaFiles: [
          {
            ...image('clip.mp4'),
            type: 'video',
            videoData: { startTime: 0, endTime: FRAME_MIN_DURATION_SEC },
          },
        ],
      }).submit();
      expect(navigate).toHaveBeenLastCalledWith('/');
    });

    it('goes home when the switch is off', async () => {
      vi.mocked(postsApi.create).mockResolvedValue({ data: card } as never);
      await setup({ shareToStory: false }).submit();
      expect(navigate).toHaveBeenLastCalledWith('/');
    });
  });

  it('a post never sends a price', async () => {
    const { submit } = setup();
    await submit();
    const sent = vi.mocked(postsApi.create).mock.calls[0][0];
    expect(sent).not.toHaveProperty('priceCents');
    expect(sent).not.toHaveProperty('isPremium');
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

  it('publishes a story with its poll and question as stickers, where they sit', async () => {
    const { submit } = setup({
      mode: 'STORY',
      isCloseFriendsOnly: true,
      storyCanvasSize: { width: 360, height: 640 },
      storyElements: [
        {
          type: 'poll',
          content: JSON.stringify({ question: 'Q?', options: ['a', 'b'] }),
          x: 36,
          y: -160,
          scale: 1.2,
          rotation: 370,
        },
        {
          type: 'qna',
          content: JSON.stringify({ prompt: 'Ask me' }),
          x: -500,
          y: 320,
          scale: 3,
          rotation: -10,
        },
        { type: 'sticker', content: '🔥', x: 0, y: 0, scale: 1, rotation: 0 },
      ],
    });
    await submit();

    expect(storiesApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cdn/a.jpg',
        mediaType: 'image',
        isCloseFriendsOnly: true,
        stickers: [
          {
            kind: 'POLL',
            settings: { question: 'Q?', options: ['a', 'b'] },
            x: 0.1,
            y: -0.25,
            scale: 1.2,
            rotation: 10,
          },
          // Kept within the story and the sizes the server accepts.
          {
            kind: 'QUESTION',
            settings: { prompt: 'Ask me' },
            x: -0.5,
            y: 0.5,
            scale: 1.35,
            rotation: -10,
          },
        ],
      }),
    );
    // One request: no separate poll or question afterwards.
    expect(interactiveApi.createPoll).not.toHaveBeenCalled();
    expect(interactiveApi.createQna).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('sends a video story as its video, with what is painted over it as a layer', async () => {
    const clip: MediaFile = {
      file: new File([new Uint8Array(10)], 'clip.mp4', { type: 'video/mp4' }),
      url: 'blob:clip',
      type: 'video',
    };
    const layer = new File(['png'], 'story_layer.png', { type: 'image/png' });
    const { deps, submit } = setup({
      mode: 'STORY',
      mediaFiles: [clip],
      storyOverlay: { video: clip.file, layer },
    });
    deps.uploadFiles
      .mockResolvedValueOnce([{ url: '/uploads/v.mp4', type: 'video' }])
      .mockResolvedValueOnce([{ url: '/uploads/l.avif', type: 'image' }]);
    await submit();

    expect(deps.uploadFiles.mock.calls[0][0][0].file).toBe(clip.file);
    expect(deps.uploadFiles.mock.calls[1][0][0]).toEqual({
      file: layer,
      url: '',
      type: 'image',
    });
    expect(storiesApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/uploads/v.mp4',
        mediaType: 'video',
        overlayUrl: '/uploads/l.avif',
      }),
    );
  });

  it('sends no layer painted on another video, as when that one was taken out', async () => {
    const clip = (name: string): MediaFile => ({
      file: new File([new Uint8Array(10)], name, { type: 'video/mp4' }),
      url: `blob:${name}`,
      type: 'video',
    });
    const first = clip('first.mp4');
    const second = clip('second.mp4');
    const { deps, submit } = setup({
      mode: 'STORY',
      mediaFiles: [second],
      storyOverlay: {
        video: first.file,
        layer: new File(['png'], 'story_layer.png', { type: 'image/png' }),
      },
    });
    deps.uploadFiles.mockResolvedValueOnce([
      { url: '/uploads/second.mp4', type: 'video' },
    ]);
    await submit();

    expect(deps.uploadFiles).toHaveBeenCalledTimes(1);
    expect(storiesApi.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ overlayUrl: expect.anything() }),
    );
  });

  it('sends no layer with a picture, nor with a video with nothing painted', async () => {
    const { submit } = setup({ mode: 'STORY', storyOverlay: null });
    await submit();

    expect(storiesApi.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ overlayUrl: expect.anything() }),
    );
  });

  it('sends a quiz, a slider and a hashtag as stickers too', async () => {
    const at = { x: 0, y: 0, scale: 1, rotation: 0 };
    const { submit } = setup({
      mode: 'STORY',
      storyCanvasSize: { width: 360, height: 640 },
      storyElements: [
        {
          type: 'quiz',
          content: JSON.stringify({
            question: 'Q',
            options: ['a', 'b'],
            correctIndex: 1,
          }),
          ...at,
        },
        {
          type: 'slider',
          content: JSON.stringify({ question: '', emoji: '🔥' }),
          ...at,
        },
        {
          type: 'hashtag',
          content: JSON.stringify({ tag: 'verano' }),
          ...at,
          scale: 2,
        },
      ],
    });
    await submit();

    expect(vi.mocked(storiesApi.create).mock.calls[0][0].stickers).toEqual([
      {
        kind: 'QUIZ',
        settings: { question: 'Q', options: ['a', 'b'], correctIndex: 1 },
        ...at,
      },
      { kind: 'SLIDER', settings: { question: '', emoji: '🔥' }, ...at },
      { kind: 'HASHTAG', settings: { tag: 'verano' }, ...at, scale: 2 },
    ]);
  });

  it('publishes a story without stickers when nothing interactive is on it', async () => {
    const { submit } = setup({ mode: 'STORY' });
    await submit();

    expect(vi.mocked(storiesApi.create).mock.calls[0][0]).not.toHaveProperty(
      'stickers',
    );
  });

  it('publishes a Frame the server put together as it is: not made or sent again', async () => {
    const stored = '/uploads/frame.mp4';
    const { deps, submit } = setup({
      mode: 'FRAME',
      mediaFiles: [
        {
          ...image('frame.mp4'),
          type: 'video',
          videoData: { startTime: 0, endTime: 20, muted: false },
          remoteUrl: stored,
          assembledFrame: true,
        },
      ],
    });
    await submit();

    expect(exportEditedVideo).not.toHaveBeenCalled();
    expect(deps.uploadFiles.mock.calls[0][0][0].remoteUrl).toBe(stored);
  });

  describe('a photo that already has an uploaded copy', () => {
    const copy = 'https://cdn.example.com/before-the-edit.jpg';

    it('is uploaded again when publishing applies its edit', async () => {
      const edited = new File(['edited'], 'edited.jpg', { type: 'image/jpeg' });
      vi.mocked(exportEditedImage).mockResolvedValue(edited);
      const { deps, submit } = setup({
        mediaFiles: [
          {
            ...image(),
            cropData: { x: 0, y: 0, width: 10, height: 10 },
            remoteUrl: copy,
          },
        ],
      });
      await submit();

      const [files] = deps.uploadFiles.mock.calls[0];
      expect(files[0].file).toBe(edited);
      // The copy uploaded before the edit must not be the one published.
      expect(files[0].remoteUrl).toBeUndefined();
    });

    it('is used as it is when the photo has no edit', async () => {
      const { deps, submit } = setup({
        mediaFiles: [{ ...image(), remoteUrl: copy }],
      });
      await submit();

      expect(deps.uploadFiles.mock.calls[0][0][0].remoteUrl).toBe(copy);
    });
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

  it('says why the server refused the link of a story', async () => {
    vi.mocked(storiesApi.create).mockRejectedValue({
      status: 400,
      data: { message: 'LINK_DOMAIN_BLOCKED', errorCode: 'HTTP_EXCEPTION' },
    });
    const { submit } = setup({ mode: 'STORY' });
    await submit();

    expect(toast.error).toHaveBeenCalledWith(
      i18n.t('createPost.storyComposer.link_errors.LINK_DOMAIN_BLOCKED'),
    );
  });

  it.each(['CONTENT_BLOCKED_BY_MODERATION'])(
    "says why when the server refuses with %s, in the reader's language",
    async (code) => {
      vi.mocked(postsApi.create).mockRejectedValue({
        status: 400,
        data: { errorCode: code, message: 'The server says it in English' },
      });
      const { submit } = setup();
      await submit();

      expect(toast.error).toHaveBeenCalledWith(i18n.t(`errors.codes.${code}`));
      expect(i18n.t(`errors.codes.${code}`)).not.toBe(`errors.codes.${code}`);
    },
  );

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
