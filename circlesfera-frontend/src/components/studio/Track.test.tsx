import { screen } from '@testing-library/react';
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
