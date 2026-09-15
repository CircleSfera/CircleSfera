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

  it('labels dual-host slots from the catalog when identity is missing', () => {
    useTracksMock.mockReturnValue([track(), track(undefined, 'sid-2')]);
    const { i18n } = renderWithProviders(<CinematicStage />);

    expect(i18n!.t('live.host_n', { n: 1 })).toBe('Host 1');
    expect(i18n!.t('live.cohost_fallback')).toBe('Co-host');
    expect(
      screen.getByText(i18n!.t('live.host_n', { n: 1 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('live.cohost_fallback')),
    ).toBeInTheDocument();
    expect(screen.queryByText('Co-Host')).not.toBeInTheDocument();
  });
});
