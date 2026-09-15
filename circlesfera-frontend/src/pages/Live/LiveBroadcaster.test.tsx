import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import LiveBroadcaster from './LiveBroadcaster';

vi.mock('@livekit/components-styles', () => ({}));

vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="livekit-room">{children}</div>
  ),
  RoomAudioRenderer: () => null,
}));

vi.mock('../../components/live/CinematicStage', () => ({
  default: () => <div data-testid="cinematic-stage" />,
}));

vi.mock('../../services/api', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('../../stores/socketStore', () => ({
  useSocketStore: {
    getState: () => ({ socket: null }),
  },
}));

vi.mock('../../services/live', () => ({
  liveApi: {
    inviteCoHost: vi.fn(),
    removeCoHost: vi.fn(),
  },
}));

vi.mock('../../services/profile.service', () => ({
  profileApi: {
    getProfile: vi.fn(),
  },
}));

async function startStream() {
  vi.mocked(apiClient.post).mockImplementation((url: string) => {
    if (url === '/live/start') {
      return Promise.resolve({
        data: { token: 'lk-token', stream: { id: 'stream-1' } },
      });
    }
    return Promise.resolve({ data: {} });
  });

  const view = renderWithProviders(<LiveBroadcaster />);
  fireEvent.click(
    screen.getByRole('button', {
      name: view.i18n!.t('live.start_button'),
    }),
  );
  await waitFor(() => {
    expect(
      screen.getByRole('button', {
        name: view.i18n!.t('live.end_stream'),
      }),
    ).toBeInTheDocument();
  });
  return view;
}

describe('LiveBroadcaster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses catalog copy on the setup screen', () => {
    const { i18n } = renderWithProviders(<LiveBroadcaster />);

    expect(i18n!.t('live.setup_title')).toBe('Go live');
    expect(
      screen.getByRole('heading', { name: i18n!.t('live.setup_title') }),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.title_label'))).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(i18n!.t('live.title_placeholder')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.start_button') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('common.close') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Empezar directo' }),
    ).not.toBeInTheDocument();
  });

  it('uses Spanish setup copy', () => {
    const { i18n } = renderWithProviders(<LiveBroadcaster />, { lng: 'es' });

    expect(i18n!.t('live.setup_title')).toBe('Empezar directo');
    expect(
      screen.getByRole('heading', { name: i18n!.t('live.setup_title') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.start_button') }),
    ).toBeInTheDocument();
  });

  it('labels end stream from the catalog after start', async () => {
    const { i18n } = await startStream();

    expect(i18n!.t('live.end_stream')).toBe('End livestream');
    expect(
      screen.getByRole('button', { name: i18n!.t('live.end_stream') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Terminar transmisión' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.goal.add'))).toBeInTheDocument();
  });

  it('shows the ended summary from the catalog', async () => {
    const { i18n } = await startStream();

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('live.end_stream') }),
    );

    expect(
      await screen.findByRole('heading', { name: i18n!.t('live.ended_title') }),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.ended_summary'))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.viewers'))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('live.likes'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.close_summary') }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Live Finalizado')).not.toBeInTheDocument();
  });
});
