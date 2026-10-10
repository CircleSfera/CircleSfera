import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import {
  mediaClip,
  openStudioProject,
  studioClip,
  studioClips,
  studioTrack,
  textClip,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import type { MediaClip, TextClip } from '../../../types/studio';
import AudioPanel from './AudioPanel';
import FiltersPanel from './FiltersPanel';
import MediaPanel from './MediaPanel';
import TextPanel from './TextPanel';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast }));

/** Chooses a file in the hidden file field of a panel. */
function choose(container: HTMLElement, file: File | null) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { files: file ? [file] : [] } });
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TextPanel', () => {
  it.each([
    ['Bold title', 'BOLD TITLE', 52, '#ffffff'],
    ['Highlighted subtitle', 'Subscriptions & Pro Tiers', 36, '#ec4899'],
    ['Neon badge', '★ CIRCLE STUDIO', 28, '#884cff'],
    ['Story-style box', '@creator_handle', 32, '#ffffff'],
  ])(
    'adds the "%s" template at the playhead for three seconds',
    (name, content, fontSize, color) => {
      openStudioProject(
        [studioTrack('v1', 'video'), studioTrack('t1', 'text')],
        { playhead: 7 },
      );
      renderWithProviders(<TextPanel />);

      fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));

      const [added] = studioClips() as TextClip[];
      expect(added).toMatchObject({
        type: 'text',
        trackId: 't1',
        content,
        startAt: 7,
        duration: 3,
      });
      expect(added.style).toMatchObject({ fontSize, color });
      expect(toast.success).toHaveBeenCalledWith('Text added to canvas');
    },
  );

  it('uses the first track when there is no text track', () => {
    openStudioProject([studioTrack('v1', 'video')]);
    renderWithProviders(<TextPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Bold title/ }));

    expect(studioClips()[0].trackId).toBe('v1');
  });

  it('adds nothing without a project', () => {
    useStudioStore.setState({ project: null });
    renderWithProviders(<TextPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Bold title/ }));

    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('MediaPanel', () => {
  it('hands over the chosen file and leaves the field ready for the same file again', () => {
    openStudioProject([studioTrack('v1', 'video')]);
    const onAddMediaFile = vi.fn();
    const { container } = renderWithProviders(
      <MediaPanel onAddMediaFile={onAddMediaFile} />,
    );
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

    const input = choose(container, file);

    expect(onAddMediaFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
    expect(input.accept).toBe('video/*,image/*');
  });

  it('hands over nothing when the picker is closed without a file', () => {
    openStudioProject([studioTrack('v1', 'video')]);
    const onAddMediaFile = vi.fn();
    const { container } = renderWithProviders(
      <MediaPanel onAddMediaFile={onAddMediaFile} />,
    );

    choose(container, null);

    expect(onAddMediaFile).not.toHaveBeenCalled();
  });

  it('opens the file picker from the import button', () => {
    openStudioProject([studioTrack('v1', 'video')]);
    const { container } = renderWithProviders(
      <MediaPanel onAddMediaFile={vi.fn()} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLElement;
    const click = vi.spyOn(input, 'click');

    fireEvent.click(
      screen.getByRole('button', { name: /Import video or image/ }),
    );

    expect(click).toHaveBeenCalled();
  });

  it.each([
    ['Neon abstraction', 'photo-1618005182384'],
    ['Studio gradient', 'photo-1579546929518'],
  ])(
    'adds the "%s" sample as a silent four second picture on the video track',
    (name, picture) => {
      openStudioProject(
        [studioTrack('t1', 'text'), studioTrack('v1', 'video')],
        { playhead: 3 },
      );
      renderWithProviders(<MediaPanel onAddMediaFile={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: name }));

      const [added] = studioClips() as MediaClip[];
      expect(added).toMatchObject({
        type: 'image',
        trackId: 'v1',
        startAt: 3,
        duration: 4,
        muted: true,
      });
      expect(added.fileUrl).toContain(picture);
      expect(toast.success).toHaveBeenCalledWith(`${name} added`);
    },
  );

  it('uses the first track when there is no video track, and nothing without a project', () => {
    openStudioProject([studioTrack('t1', 'text')]);
    const { unmount } = renderWithProviders(
      <MediaPanel onAddMediaFile={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Neon abstraction' }));
    expect(studioClips()[0].trackId).toBe('t1');
    unmount();

    vi.clearAllMocks();
    useStudioStore.setState({ project: null });
    renderWithProviders(<MediaPanel onAddMediaFile={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Neon abstraction' }));
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('AudioPanel', () => {
  it('hands over the chosen sound file, and nothing when none is chosen', () => {
    const onAddAudioFile = vi.fn();
    const { container } = renderWithProviders(
      <AudioPanel onAddAudioFile={onAddAudioFile} />,
    );
    const file = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });

    choose(container, null);
    expect(onAddAudioFile).not.toHaveBeenCalled();

    const input = choose(container, file);
    expect(onAddAudioFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
    expect(input.accept).toBe('audio/*');
  });

  it('opens the file picker from its button', () => {
    const { container } = renderWithProviders(
      <AudioPanel onAddAudioFile={vi.fn()} />,
    );
    const click = vi.spyOn(
      container.querySelector('input[type="file"]') as HTMLElement,
      'click',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Upload audio from device' }),
    );

    expect(click).toHaveBeenCalled();
  });
});

describe('FiltersPanel', () => {
  const open = (selectedClipId: string | null) =>
    openStudioProject(
      [
        studioTrack('v1', 'video', [
          mediaClip('clip'),
          mediaClip('photo', { type: 'image', startAt: 10 }),
          mediaClip('song', { type: 'audio', startAt: 20 }),
        ]),
        studioTrack('t1', 'text', [textClip('words')]),
      ],
      { selectedClipId },
    );

  it.each([
    ['Cinema B&W', 'grayscale(1) contrast(1.2)'],
    ['Vintage sepia', 'sepia(0.8) contrast(1.1)'],
    ['Cyber neon', 'hue-rotate(90deg) saturate(1.8)'],
    ['Drama contrast', 'contrast(1.5) saturate(1.3)'],
    ['Inverted', 'invert(0.9)'],
    ['Normal', ''],
  ])(
    'applies "%s" to the selected video in one step that can be undone',
    (name, filter) => {
      open('clip');
      renderWithProviders(<FiltersPanel />);

      fireEvent.click(screen.getByRole('button', { name }));

      expect(studioClip('clip').filter).toBe(filter);
      expect(useStudioStore.getState().canUndo).toBe(true);
      expect(toast.success).toHaveBeenCalledWith(`Filter "${name}" applied`);
      expect(
        screen.queryByText('Select a clip to apply a filter'),
      ).not.toBeInTheDocument();
    },
  );

  it('applies to a picture as well', () => {
    open('photo');
    renderWithProviders(<FiltersPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Inverted' }));

    expect(studioClip('photo').filter).toBe('invert(0.9)');
  });

  it.each([
    ['nothing', null],
    ['a text', 'words'],
    ['a sound', 'song'],
  ])(
    'asks for a clip and changes nothing when %s is selected',
    (_what, selected) => {
      open(selected);
      renderWithProviders(<FiltersPanel />);

      expect(
        screen.getByText('Select a clip to apply a filter'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cinema B&W' }));

      expect(toast.error).toHaveBeenCalledWith(
        'Select a clip to apply a filter',
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(useStudioStore.getState().canUndo).toBe(false);
      for (const clip of studioClips()) {
        expect((clip as MediaClip).filter).toBeUndefined();
      }
    },
  );
});
