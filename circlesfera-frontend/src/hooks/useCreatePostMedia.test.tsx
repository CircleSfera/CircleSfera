import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeVideoDuration } from '../constants/uploadLimits';
import { aiApi } from '../services';
import { useCreatePostMedia } from './useCreatePostMedia';
import type { CreateMode, PostTagData } from './useCreatePostState';

const upload = vi.hoisted(() => ({ uploadFiles: vi.fn() }));

vi.mock('../constants/uploadLimits', async (original) => ({
  ...(await original<typeof import('../constants/uploadLimits')>()),
  probeVideoDuration: vi.fn(),
}));
vi.mock('./useMediaProcessing', () => ({
  // Phone photo formats are converted here; in these tests files pass as is.
  useMediaProcessing: () => ({ processFiles: async (files: File[]) => files }),
}));
vi.mock('./useMediaUpload', () => ({
  useMediaUpload: () => ({
    isUploading: false,
    uploadFiles: upload.uploadFiles,
  }),
}));
vi.mock('../services', () => ({ aiApi: { generateAltText: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }));

const photo = (name = 'a.jpg', size = 1000) => {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};
const clip = (name = 'a.mp4', size = 1000) => {
  const file = new File(['x'], name, { type: 'video/mp4' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};
const MB = 1024 * 1024;

function setup(mode: CreateMode = 'POST') {
  const page = {
    setStep: vi.fn(),
    setShowFrameTrim: vi.fn(),
    setFrameSourceDurationSec: vi.fn(),
    setOriginalStoryMedia: vi.fn(),
  };
  const hook = renderHook(() => useCreatePostMedia({ mode, ...page }));
  /** The person picks files in the file dialog. */
  const pick = async (...files: File[]) => {
    const input = { files, value: 'C:\\fakepath\\picked' };
    await act(() =>
      hook.result.current.handleFileSelect({
        target: input,
      } as unknown as ChangeEvent<HTMLInputElement>),
    );
    return input;
  };
  return { page, pick, media: () => hook.result.current, ...hook };
}

describe('useCreatePostMedia', () => {
  let nextUrl: number;

  beforeEach(() => {
    vi.clearAllMocks();
    nextUrl = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++nextUrl}`);
    URL.revokeObjectURL = vi.fn();
    vi.mocked(probeVideoDuration).mockResolvedValue(30);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('choosing files for a post', () => {
    it('adds photos and videos and goes to the edit step', async () => {
      const { pick, media, page } = setup();

      await pick(photo(), clip());

      expect(media().mediaFiles.map((m) => [m.type, m.url])).toEqual([
        ['image', 'blob:1'],
        ['video', 'blob:2'],
      ]);
      expect(page.setStep).toHaveBeenCalledWith('edit');
      expect(page.setShowFrameTrim).not.toHaveBeenCalled();
    });

    it('adds to what was already chosen', async () => {
      const { pick, media } = setup();

      await pick(photo('a.jpg'));
      await pick(photo('b.jpg'));

      expect(media().mediaFiles.map((m) => m.file.name)).toEqual([
        'a.jpg',
        'b.jpg',
      ]);
    });

    it('does nothing when the dialog is closed with no file', async () => {
      const { pick, media, page } = setup();

      await pick();

      expect(media().mediaFiles).toEqual([]);
      expect(page.setStep).not.toHaveBeenCalled();
    });

    it('refuses a file over the size limit, by name, and takes none', async () => {
      const { pick, media, page } = setup();

      const input = await pick(photo('ok.jpg'), photo('huge.jpg', 101 * MB));

      expect(toast.error).toHaveBeenCalledWith(
        'huge.jpg exceeds the 100 MB limit.',
      );
      expect(media().mediaFiles).toEqual([]);
      expect(page.setStep).not.toHaveBeenCalled();
      // The same file can be picked again after the refusal.
      expect(input.value).toBe('');
    });

    it('accepts a file of exactly the size limit', async () => {
      const { pick, media } = setup();

      await pick(photo('edge.jpg', 100 * MB));

      expect(media().mediaFiles).toHaveLength(1);
    });

    it('refuses a video longer than five minutes', async () => {
      vi.mocked(probeVideoDuration).mockResolvedValue(301);
      const { pick, media } = setup();

      await pick(clip());

      expect(toast.error).toHaveBeenCalledWith(
        'Post videos must be 300 seconds or shorter.',
      );
      expect(media().mediaFiles).toEqual([]);
    });

    it('accepts a video of exactly five minutes', async () => {
      vi.mocked(probeVideoDuration).mockResolvedValue(300);
      const { pick, media } = setup();

      await pick(clip());

      expect(media().mediaFiles).toHaveLength(1);
    });

    it('refuses a video whose length cannot be read', async () => {
      vi.mocked(probeVideoDuration).mockRejectedValue(new Error('codec'));
      const { pick, media } = setup();

      await pick(photo(), clip());

      expect(toast.error).toHaveBeenCalledWith(
        'Could not read this video’s duration. Try another file.',
      );
      expect(media().mediaFiles).toEqual([]);
    });

    it('does not measure photos', async () => {
      const { pick } = setup();

      await pick(photo(), photo('b.jpg'));

      expect(probeVideoDuration).not.toHaveBeenCalled();
    });
  });

  describe('choosing a file for a story', () => {
    it('refuses a video longer than a minute', async () => {
      vi.mocked(probeVideoDuration).mockResolvedValue(61);
      const { pick, media } = setup('STORY');

      await pick(clip());

      expect(toast.error).toHaveBeenCalledWith(
        'Story videos must be 60 seconds or shorter.',
      );
      expect(media().mediaFiles).toEqual([]);
    });

    it('keeps the original aside, for the story editor to go back to', async () => {
      const { pick, page, media } = setup('STORY');

      await pick(photo());

      expect(page.setOriginalStoryMedia).toHaveBeenCalledWith(
        media().mediaFiles[0],
      );
    });
  });

  describe('choosing the video of a frame', () => {
    it('takes one video and opens the trim over the whole clip', async () => {
      vi.mocked(probeVideoDuration).mockResolvedValue(40);
      const { pick, media, page } = setup('FRAME');

      await pick(clip('first.mp4'), clip('second.mp4'));

      expect(media().mediaFiles).toHaveLength(1);
      expect(media().mediaFiles[0]).toMatchObject({
        type: 'video',
        videoData: { startTime: 0, endTime: 40, muted: false },
      });
      expect(media().mediaFiles[0].file.name).toBe('first.mp4');
      expect(page.setFrameSourceDurationSec).toHaveBeenCalledWith(40);
      expect(page.setShowFrameTrim).toHaveBeenCalledWith(true);
      expect(page.setStep).toHaveBeenCalledWith('edit');
    });

    it('starts a long video with its first ninety seconds', async () => {
      vi.mocked(probeVideoDuration).mockResolvedValue(600);
      const { pick, media, page } = setup('FRAME');

      await pick(clip());

      expect(media().mediaFiles[0].videoData).toMatchObject({
        startTime: 0,
        endTime: 90,
      });
      expect(page.setFrameSourceDurationSec).toHaveBeenCalledWith(600);
    });

    it('replaces the video chosen before', async () => {
      const { pick, media } = setup('FRAME');

      await pick(clip('first.mp4'));
      await pick(clip('second.mp4'));

      expect(media().mediaFiles.map((m) => m.file.name)).toEqual([
        'second.mp4',
      ]);
    });

    it('refuses anything that is not video', async () => {
      const { pick, media, page } = setup('FRAME');

      const input = await pick(clip(), photo());

      expect(toast.error).toHaveBeenCalledWith('Frames only accept video.');
      expect(media().mediaFiles).toEqual([]);
      expect(page.setShowFrameTrim).not.toHaveBeenCalled();
      expect(input.value).toBe('');
    });

    it('refuses a video under fifteen seconds', async () => {
      vi.mocked(probeVideoDuration).mockResolvedValue(14.9);
      const { pick, media } = setup('FRAME');

      await pick(clip());

      expect(toast.error).toHaveBeenCalledWith(
        'Frame videos must be at least 15 seconds. Pick a longer clip.',
      );
      expect(media().mediaFiles).toEqual([]);
    });

    it('accepts a video of exactly fifteen seconds', async () => {
      vi.mocked(probeVideoDuration).mockResolvedValue(15);
      const { pick, media } = setup('FRAME');

      await pick(clip());

      expect(media().mediaFiles).toHaveLength(1);
    });

    it('refuses a video whose length cannot be read', async () => {
      vi.mocked(probeVideoDuration).mockRejectedValue(new Error('codec'));
      const { pick, media } = setup('FRAME');

      await pick(clip());

      expect(toast.error).toHaveBeenCalledWith(
        'Could not read this video’s duration. Try another file.',
      );
      expect(media().mediaFiles).toEqual([]);
    });
  });

  describe('the trim of a frame', () => {
    it('keeps the chosen part and closes', async () => {
      vi.mocked(probeVideoDuration).mockResolvedValue(40);
      const { pick, media, page } = setup('FRAME');
      await pick(clip());

      act(() =>
        media().handleFrameTrimConfirm({
          startTime: 5,
          endTime: 25,
          muted: true,
        }),
      );

      expect(media().mediaFiles[0].videoData).toEqual({
        startTime: 5,
        endTime: 25,
        muted: true,
      });
      expect(page.setShowFrameTrim).toHaveBeenLastCalledWith(false);
    });

    it('does nothing to an empty composer', () => {
      const { media } = setup('FRAME');

      act(() =>
        media().handleFrameTrimConfirm({
          startTime: 0,
          endTime: 20,
          muted: false,
        }),
      );

      expect(media().mediaFiles).toEqual([]);
    });

    it('drops the video and goes back to the first step when cancelled', async () => {
      const { pick, media, page } = setup('FRAME');
      await pick(clip());

      act(() => media().handleFrameTrimCancel());

      expect(media().mediaFiles).toEqual([]);
      // The preview held in memory is released.
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
      expect(page.setFrameSourceDurationSec).toHaveBeenLastCalledWith(0);
      expect(page.setShowFrameTrim).toHaveBeenLastCalledWith(false);
      expect(page.setStep).toHaveBeenLastCalledWith('upload');
    });
  });

  describe('saving an edit', () => {
    it('replaces the edited file and its preview, and leaves the editor', async () => {
      const { pick, media } = setup();
      await pick(photo('a.jpg'), photo('b.jpg'));
      // What the photo editor saved for the second photo.
      act(() =>
        media().setMediaFiles((list) =>
          list.map((m, i) =>
            i === 1
              ? {
                  ...m,
                  editorState: {
                    filter: '',
                    adjustments: {
                      brightness: 130,
                      contrast: 100,
                      saturation: 100,
                      sepia: 0,
                      grayscale: 0,
                      hue: 0,
                      blur: 0,
                      temperature: 100,
                      vignette: 20,
                      noise: 0,
                    },
                  },
                }
              : m,
          ),
        ),
      );

      act(() =>
        media().handleQuickFilter(1, 'grayscale brightness-110 contrast-110'),
      );

      const [first, second] = media().mediaFiles;
      expect(first.filter).toBeUndefined();
      expect(second.filter).toBe(
        'filter-class:grayscale brightness-110 contrast-110__style:brightness(130%) contrast(100%) saturate(100%) sepia(0%) grayscale(0%) hue-rotate(0deg) blur(0px)__temp:100__vignette:20__noise:0',
      );
      // The photo editor opens on it next time.
      expect(second.editorState?.filter).toBe(
        'grayscale brightness-110 contrast-110',
      );
      expect(second.editorState?.adjustments?.brightness).toBe(130);
    });

    it('starts from neutral adjustments on a photo never edited', async () => {
      const { pick, media } = setup();
      await pick(photo('a.jpg'));

      act(() => media().handleQuickFilter(0, 'sepia-[.25]'));

      expect(media().mediaFiles[0].filter).toBe(
        'filter-class:sepia-[.25]__style:brightness(100%) contrast(100%) saturate(100%) sepia(0%) grayscale(0%) hue-rotate(0deg) blur(0px)__temp:100__vignette:0__noise:0',
      );
    });
  });

  describe('removing a file', () => {
    it('closes the gap in descriptions and tags', async () => {
      const { pick, media, page } = setup();
      await pick(photo('a.jpg'), photo('b.jpg'), photo('c.jpg'));
      page.setStep.mockClear();
      act(() => {
        media().setAltTextMap({ 0: 'first', 1: 'second', 2: 'third' });
        media().setTagsMap({ 2: [{ profileId: 'ana' }] as PostTagData[] });
      });

      act(() => media().handleRemoveFile(1));

      expect(media().mediaFiles.map((m) => m.file.name)).toEqual([
        'a.jpg',
        'c.jpg',
      ]);
      expect(media().altTextMap).toEqual({ 0: 'first', 1: 'third' });
      expect(media().tagsMap).toEqual({ 1: [{ profileId: 'ana' }] });
      expect(page.setStep).not.toHaveBeenCalled();
    });

    it('goes back to the first step when the last one is removed', async () => {
      const { pick, media, page } = setup();
      await pick(photo());

      act(() => media().handleRemoveFile(0));

      expect(media().mediaFiles).toEqual([]);
      expect(page.setStep).toHaveBeenLastCalledWith('upload');
    });
  });

  describe('a description written by the assistant', () => {
    it('uploads the photo, asks for its description and keeps both', async () => {
      upload.uploadFiles.mockResolvedValue([{ url: 'https://cdn/b.jpg' }]);
      vi.mocked(aiApi.generateAltText).mockResolvedValue({
        data: { text: 'Two people on a beach' },
      } as never);
      const { pick, media } = setup();
      await pick(photo('a.jpg'), photo('b.jpg'));

      await act(() => media().generateAltTextForIndex(1));

      expect(upload.uploadFiles).toHaveBeenCalledWith(
        [expect.objectContaining({ url: 'blob:2' })],
        {},
      );
      expect(aiApi.generateAltText).toHaveBeenCalledWith('https://cdn/b.jpg');
      expect(media().altTextMap).toEqual({ 1: 'Two people on a beach' });
      expect(media().mediaFiles[1].remoteUrl).toBe('https://cdn/b.jpg');
      expect(media().mediaFiles[0].remoteUrl).toBeUndefined();
    });

    it('is not offered for a video', async () => {
      const { pick, media } = setup();
      await pick(clip());

      await act(() => media().generateAltTextForIndex(0));

      expect(upload.uploadFiles).not.toHaveBeenCalled();
    });

    it('says so and leaves the description alone when it cannot be written', async () => {
      upload.uploadFiles.mockResolvedValue([{ url: 'https://cdn/a.jpg' }]);
      vi.mocked(aiApi.generateAltText).mockRejectedValue(new Error('busy'));
      const { pick, media } = setup();
      await pick(photo());
      act(() => media().setAltTextMap({ 0: 'Mine' }));

      await act(() => media().generateAltTextForIndex(0));

      expect(toast.error).toHaveBeenCalledWith(
        'Could not generate the description. Write it yourself or try again.',
      );
      expect(media().altTextMap).toEqual({ 0: 'Mine' });
    });
  });
});
