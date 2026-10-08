import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStudioStore } from '../../stores/studioStore';
import { renderWithProviders } from '../../test/test-utils';
import type { MediaClip, StudioProject, Track } from '../../types/studio';
import TrackItem from './Track';

const clip: MediaClip = {
  id: 'clip-1',
  type: 'video',
  trackId: 'track-1',
  startAt: 0,
  duration: 4,
  fileUrl: 'https://cdn.example.com/clip.mp4',
  file: null,
  mediaStart: 0,
  speed: 1,
  volume: 1,
  muted: false,
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
};

const track: Track = {
  id: 'track-1',
  type: 'video',
  name: 'V1',
  clips: [clip],
  muted: false,
  hidden: false,
  locked: false,
};

const project: StudioProject = {
  id: 'p1',
  name: 'Test',
  tracks: [track],
  duration: 10,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('TrackItem clip trim handles', () => {
  beforeEach(() => {
    useStudioStore.setState({
      project,
      selectedClipId: clip.id,
      zoom: 40,
      playhead: 0,
    });
  });

  it('labels trim start/end from the catalog when the clip is selected', () => {
    const { i18n } = renderWithProviders(<TrackItem track={track} />);

    expect(i18n!.t('studio.trim_start')).toBe('Trim start');
    expect(i18n!.t('studio.trim_end')).toBe('Trim end');
    expect(
      screen.getByRole('button', { name: i18n!.t('studio.trim_start') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('studio.trim_end') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Recortar inicio' }),
    ).not.toBeInTheDocument();
  });

  it('uses Spanish trim labels', () => {
    const { i18n } = renderWithProviders(<TrackItem track={track} />, {
      lng: 'es',
    });

    expect(i18n!.t('studio.trim_start')).toBe('Recortar inicio');
    expect(i18n!.t('studio.trim_end')).toBe('Recortar final');
    expect(
      screen.getByRole('button', { name: i18n!.t('studio.trim_start') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('studio.trim_end') }),
    ).toBeInTheDocument();
  });

  it('hides trim handles when the clip is not selected', () => {
    useStudioStore.setState({ selectedClipId: null });
    const { i18n } = renderWithProviders(<TrackItem track={track} />);

    expect(
      screen.queryByRole('button', { name: i18n!.t('studio.trim_start') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: i18n!.t('studio.trim_end') }),
    ).not.toBeInTheDocument();
  });
});

describe('TrackItem controls', () => {
  beforeEach(() => {
    useStudioStore.setState({
      project,
      selectedClipId: null,
      zoom: 40,
      playhead: 0,
    });
  });

  it('opens and closes the track controls from the track icon', () => {
    const { i18n } = renderWithProviders(<TrackItem track={track} />);
    const options = screen.getByRole('button', {
      name: i18n!.t('studio.tracks.options', { name: 'V1' }),
    });
    const controls = screen.getByRole('button', {
      name: i18n!.t('studio.mute'),
    }).parentElement as HTMLElement;

    // Folded on phones until the icon is pressed; always shown from md up.
    expect(options).toHaveAttribute('aria-expanded', 'false');
    expect(controls.className).toMatch(/\bhidden\b/);
    expect(controls.className).toMatch(/md:flex/);

    fireEvent.click(options);
    expect(options).toHaveAttribute('aria-expanded', 'true');
    expect(controls.className).not.toMatch(/(^|\s)hidden(\s|$)/);

    fireEvent.click(options);
    expect(options).toHaveAttribute('aria-expanded', 'false');
  });

  it('asks in the app dialog before removing a track that has clips', () => {
    const second: Track = { ...track, id: 'track-2', name: 'V2' };
    useStudioStore.setState({
      project: { ...project, tracks: [track, second] },
    });
    const { i18n } = renderWithProviders(<TrackItem track={track} />);

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('studio.tracks.remove') }),
    );

    expect(
      screen.getByText(i18n!.t('studio.tracks.remove_confirm')),
    ).toBeInTheDocument();
    expect(useStudioStore.getState().project?.tracks).toHaveLength(2);

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('common.confirm') }),
    );

    expect(useStudioStore.getState().project?.tracks.map((t) => t.id)).toEqual([
      'track-2',
    ]);
  });

  it('mutes the track from its controls, opened first as on a phone', () => {
    const { i18n, rerender } = renderWithProviders(<TrackItem track={track} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('studio.tracks.options', { name: 'V1' }),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('studio.mute') }),
    );

    const muted = useStudioStore.getState().project?.tracks[0];
    rerender(<TrackItem track={muted ?? track} />);
    expect(
      screen.getByRole('button', { name: i18n!.t('studio.unmute') }),
    ).toBeInTheDocument();
  });

  it('offers the options button only where the controls fold', () => {
    const { i18n } = renderWithProviders(<TrackItem track={track} />);

    // From md up the controls are always shown, so nothing claims to expand.
    expect(
      screen.getByRole('button', {
        name: i18n!.t('studio.tracks.options', { name: 'V1' }),
      }).className,
    ).toMatch(/md:hidden/);
  });

  it('names the track in its options button, so two tracks can be told apart', () => {
    const second: Track = { ...track, id: 'track-2', name: 'V2' };
    const { i18n } = renderWithProviders(
      <>
        <TrackItem track={track} />
        <TrackItem track={second} />
      </>,
    );

    expect(
      screen.getByRole('button', {
        name: i18n!.t('studio.tracks.options', { name: 'V1' }),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('studio.tracks.options', { name: 'V2' }),
      }),
    ).toBeInTheDocument();
  });
});
