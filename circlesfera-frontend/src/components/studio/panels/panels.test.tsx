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
import TextPanel from './TextPanel';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast }));
// The music panel asks the library for songs as it opens: answered here,
// so no request leaves the test and nothing is logged after it ends.
vi.mock('../../../services/audio.service', () => ({
  audioApi: {
    getTrending: vi.fn().mockResolvedValue({ data: [] }),
    search: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

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
      // Chosen, and open to be written.
      expect(useStudioStore.getState().selectedClipId).toBe(added.id);
      expect(useStudioStore.getState().openSheet).toBe('adjust');
    },
  );

  it('makes a text layer when there is none', () => {
    openStudioProject([studioTrack('v1', 'video')]);
    renderWithProviders(<TextPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Bold title/ }));

    const tracks = useStudioStore.getState().project?.tracks ?? [];
    expect(tracks).toHaveLength(2);
    expect(tracks[1]).toMatchObject({ type: 'text', name: 'Text' });
    expect(tracks[1].clips).toHaveLength(1);
  });

  it('puts a text that would cover another on a new layer', () => {
    openStudioProject(
      [
        studioTrack('v1', 'video'),
        studioTrack('t1', 'text', [
          textClip('old', { trackId: 't1', startAt: 6, duration: 3 }),
        ]),
      ],
      { playhead: 7 },
    );
    renderWithProviders(<TextPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Bold title/ }));

    const tracks = useStudioStore.getState().project?.tracks ?? [];
    expect(tracks.filter((tr) => tr.type === 'text')).toHaveLength(2);
    expect(tracks[2].clips[0]).toMatchObject({
      startAt: 7,
      trackId: tracks[2].id,
    });
  });

  it('adds nothing without a project', () => {
    useStudioStore.setState({ project: null });
    renderWithProviders(<TextPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Bold title/ }));

    expect(useStudioStore.getState().project).toBeNull();
  });
});

describe('AudioPanel', () => {
  it('hands over the chosen sound file, and nothing when none is chosen', () => {
    const onAddAudioFile = vi.fn();
    const { container } = renderWithProviders(
      <AudioPanel
        onAddLibraryAudio={vi.fn()}
        onAddAudioFile={onAddAudioFile}
      />,
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
      <AudioPanel onAddLibraryAudio={vi.fn()} onAddAudioFile={vi.fn()} />,
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
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(
        screen.queryByText('Select a clip to apply a filter'),
      ).not.toBeInTheDocument();
    },
  );

  it('shows part of a filter, one step of undo per drag, and back to all of it with a double tap', () => {
    open('clip');
    renderWithProviders(<FiltersPanel />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cinema B&W' }));
    const slider = screen.getByRole('slider', { name: /Intensity/ });
    expect(slider).toHaveValue('100');
    const before = useStudioStore.getState().past.length;
    fireEvent.change(slider, { target: { value: '60' } });
    fireEvent.change(slider, { target: { value: '40' } });
    fireEvent.pointerUp(slider);
    expect((studioClip('clip') as MediaClip).filterIntensity).toBe(40);
    expect(useStudioStore.getState().past.length).toBe(before + 1);
    fireEvent.doubleClick(slider);
    expect((studioClip('clip') as MediaClip).filterIntensity).toBe(100);
    expect(useStudioStore.getState().past.length).toBe(before + 2);
  });

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
      expect(
        screen.queryByRole('button', { name: 'Cinema B&W' }),
      ).not.toBeInTheDocument();
      expect(useStudioStore.getState().canUndo).toBe(false);
      for (const clip of studioClips()) {
        expect((clip as MediaClip).filter).toBeUndefined();
      }
    },
  );
});
