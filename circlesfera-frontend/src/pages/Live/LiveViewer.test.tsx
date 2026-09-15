import { screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import LiveViewer from './LiveViewer';

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
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../stores/socketStore', () => ({
  useSocketStore: {
    getState: () => ({ socket: null }),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderViewer(path = '/live/stream-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/live/:streamId" element={<LiveViewer />} />
    </Routes>,
    {
      routerProps: {
        initialEntries: [path],
        useTransitions: false,
      },
    },
  );
}

function mockJoin(username = 'alice') {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (String(url).includes('/live/join/')) {
      return Promise.resolve({ data: { token: 'lk-token' } });
    }
    return Promise.resolve({
      data: {
        title: 'Night set',
        host: { profile: { username, avatar: null } },
      },
    });
  });
}

describe('LiveViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows catalog copy while connecting', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    const { i18n } = renderViewer();

    expect(i18n!.t('live.connecting')).toBe('Connecting to live stream...');
    expect(screen.getByText(i18n!.t('live.connecting'))).toBeInTheDocument();
    expect(
      screen.queryByText('Conectando al directo...'),
    ).not.toBeInTheDocument();
  });

  it('uses Spanish connecting copy', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    const { i18n } = renderWithProviders(
      <Routes>
        <Route path="/live/:streamId" element={<LiveViewer />} />
      </Routes>,
      {
        lng: 'es',
        routerProps: {
          initialEntries: ['/live/stream-1'],
          useTransitions: false,
        },
      },
    );

    expect(i18n!.t('live.connecting')).toBe('Conectando al directo...');
    expect(screen.getByText(i18n!.t('live.connecting'))).toBeInTheDocument();
  });

  it('labels live chrome from the catalog after join', async () => {
    mockJoin();
    const { i18n } = renderViewer();

    expect(await screen.findByText(i18n!.t('live.now'))).toBeInTheDocument();
    expect(i18n!.t('live.now')).toBe('LIVE');
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('Night set')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(i18n!.t('live.chat_placeholder')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.send_gift_btn') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('common.close') }),
    ).toBeInTheDocument();
    expect(screen.queryByText('VIVO')).not.toBeInTheDocument();
    expect(screen.queryByText('Creador Live')).not.toBeInTheDocument();
  });

  it('uses Spanish live chrome', async () => {
    mockJoin();
    const { i18n } = renderWithProviders(
      <Routes>
        <Route path="/live/:streamId" element={<LiveViewer />} />
      </Routes>,
      {
        lng: 'es',
        routerProps: {
          initialEntries: ['/live/stream-1'],
          useTransitions: false,
        },
      },
    );

    expect(i18n!.t('live.now')).toBe('VIVO');
    expect(await screen.findByText(i18n!.t('live.now'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.send_gift_btn') }),
    ).toBeInTheDocument();
  });

  it('toasts catalog copy after a successful gift checkout return', async () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    const { i18n } = renderViewer('/live/stream-1?gift_success=true');

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(i18n!.t('live.gift_sent'));
    });
    expect(i18n!.t('live.gift_sent')).toBe('Gift sent!');
    expect(toast.success).not.toHaveBeenCalledWith('¡Regalo enviado!');
  });

  it('toasts ended-or-not-found when join fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('gone'));
    const { i18n } = renderViewer();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('live.ended_or_not_found'),
      );
    });
  });
});
