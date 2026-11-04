import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import CinematicStage from './CinematicStage';

const { useTracksMock } = vi.hoisted(() => ({
  useTracksMock: vi.fn(() => [] as unknown[]),
}));

vi.mock('@livekit/components-react', () => ({
  useTracks: () => useTracksMock(),
  TrackToggle: () => null,
  VideoTrack: () => <div data-testid="video-track" />,
}));

vi.mock('livekit-client', () => ({
  Track: { Source: { Camera: 'camera' } },
}));

function track(identity?: string, sid = 'sid-1') {
  return {
    participant: { identity, sid },
  };
}

describe('CinematicStage', () => {
  beforeEach(() => {
    useTracksMock.mockReturnValue([]);
  });

  it('uses catalog copy while the host camera is starting', () => {
    const { i18n } = renderWithProviders(<CinematicStage isBroadcaster />);

    expect(i18n!.t('live.starting_camera')).toBe('Starting camera...');
    expect(
      screen.getByText(i18n!.t('live.starting_camera')),
    ).toBeInTheDocument();
    expect(screen.queryByText('Iniciando cámara...')).not.toBeInTheDocument();
  });

  it('uses catalog copy while a viewer waits for the stream', () => {
    const { i18n } = renderWithProviders(<CinematicStage />);

    expect(i18n!.t('live.waiting_stream')).toBe('Waiting for stream...');
    expect(
      screen.getByText(i18n!.t('live.waiting_stream')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Esperando transmisión...'),
    ).not.toBeInTheDocument();
  });

  it('fills the stage with the host alone, with no name over it', () => {
    useTracksMock.mockReturnValue([track('host-profile', 'sid-1')]);
    renderWithProviders(<CinematicStage names={{ 'host-profile': 'ana' }} />);

    expect(screen.getAllByTestId('video-track')).toHaveLength(1);
    expect(screen.queryByText('ana')).not.toBeInTheDocument();
  });

  it('names each person on the stage from the names given, by Profile id', () => {
    useTracksMock.mockReturnValue([
      track('host-profile', 'sid-1'),
      track('guest-profile', 'sid-2'),
    ]);
    renderWithProviders(
      <CinematicStage
        names={{ 'host-profile': 'ana', 'guest-profile': 'luis' }}
      />,
    );

    expect(screen.getByText('ana')).toBeInTheDocument();
    expect(screen.getByText('luis')).toBeInTheDocument();
    // Never the id the video room knows them by.
    expect(screen.queryByText('guest-profile')).not.toBeInTheDocument();
  });

  it('says guest for someone it has no name for', () => {
    useTracksMock.mockReturnValue([track('a', 'sid-1'), track('b', 'sid-2')]);
    const { i18n } = renderWithProviders(<CinematicStage />);

    expect(screen.getAllByText(i18n!.t('live.guests.fallback'))).toHaveLength(
      2,
    );
  });

  it('stacks two people, upright, on every screen', () => {
    useTracksMock.mockReturnValue([track('a', 'sid-1'), track('b', 'sid-2')]);
    renderWithProviders(<CinematicStage />);

    const stage = screen.getByTestId('live-stage');
    expect(stage.className).toContain('grid-cols-1');
    expect(stage.className).toContain('grid-rows-2');
  });

  it('puts the host and up to three guests in a grid of two by two', () => {
    useTracksMock.mockReturnValue(
      ['a', 'b', 'c', 'd', 'e'].map((id, i) => track(id, `sid-${i}`)),
    );
    renderWithProviders(<CinematicStage />);

    expect(screen.getByTestId('live-stage').className).toContain('grid-cols-2');
    // Never more than the host and the guests a live may have.
    expect(screen.getAllByTestId('video-track')).toHaveLength(4);
  });
});
