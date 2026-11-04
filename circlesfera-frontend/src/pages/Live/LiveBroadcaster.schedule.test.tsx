import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import type { ScheduledLive } from '../../services/live';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import { formatLiveStart } from '../../utils/liveSchedule';
import LiveBroadcaster from './LiveBroadcaster';

// Scheduling from the setup, and going live from an upcoming live.

const navigate = vi.hoisted(() => vi.fn());
const live = vi.hoisted(() => ({
  listScheduled: vi.fn(),
  schedule: vi.fn(),
  cancelScheduled: vi.fn(),
  inviteGuest: vi.fn(),
  removeGuest: vi.fn(),
  getStream: vi.fn(),
}));

vi.mock('@livekit/components-styles', () => ({}));
vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="livekit-room">{children}</div>
  ),
  RoomAudioRenderer: () => null,
  useLocalParticipant: () => ({
    localParticipant: {
      setCameraEnabled: vi.fn(),
      setMicrophoneEnabled: vi.fn(),
      getTrackPublication: vi.fn(),
    },
    isCameraEnabled: true,
    isMicrophoneEnabled: true,
  }),
}));
vi.mock('../../components/live/CinematicStage', () => ({
  default: () => <div data-testid="cinematic-stage" />,
}));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('../../services/api', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('../../stores/socketStore', () => ({
  useSocketStore: { getState: () => ({ socket: null }) },
}));
vi.mock('../../services/live', () => ({ liveApi: live }));
vi.mock('../../services/profile.service', () => ({
  profileApi: { getProfile: vi.fn() },
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const upcoming = (over: Partial<ScheduledLive> = {}): ScheduledLive => ({
  id: 'sl-1',
  hostId: 'me',
  title: 'Sunday chat',
  audience: 'CLOSE_FRIENDS',
  startsAt: '2026-11-09T18:30:00.000Z',
  status: 'SCHEDULED',
  reminded: false,
  reminderCount: 2,
  ...over,
});

describe('LiveBroadcaster scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      profile: { id: 'me', username: 'host' } as never,
    });
    live.listScheduled.mockResolvedValue([]);
    live.getStream.mockResolvedValue({ guests: [] });
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { token: 'lk-token', stream: { id: 'stream-1' } },
    });
  });

  it('schedules the live with the title and audience of the setup, then closes it and says when', async () => {
    const scheduled = upcoming({ audience: 'EVERYONE', title: 'Book club' });
    live.schedule.mockResolvedValue(scheduled);
    const { i18n } = renderWithProviders(<LiveBroadcaster />);
    const t = i18n!.t;
    fireEvent.change(
      screen.getByRole('textbox', { name: t('live.title_label') }),
      { target: { value: '  Book club ' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: t('live.schedule.tool') }),
    );
    const sheet = await screen.findByRole('dialog', {
      name: t('live.schedule.sheet_title'),
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: t('live.schedule.submit') }),
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(-1));
    expect(live.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Book club', audience: 'EVERYONE' }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      t('live.schedule.scheduled_toast', {
        when: formatLiveStart(scheduled.startsAt, 'en'),
      }),
    );
    // Nothing went live.
    expect(apiClient.post).not.toHaveBeenCalledWith(
      '/live/start',
      expect.anything(),
    );
  });

  it('explains instead of scheduling while practice is chosen', async () => {
    const { i18n } = renderWithProviders(<LiveBroadcaster />);
    const t = i18n!.t;
    fireEvent.click(
      screen.getByRole('button', { name: t('live.audience.PRACTICE') }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: t('live.schedule.tool') }),
    );
    expect(
      await screen.findByText(t('live.schedule.practice_hint')),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('live.schedule.submit') }),
    ).not.toBeInTheDocument();
  });

  it('goes live from an upcoming live, which brings its own title and audience', async () => {
    live.listScheduled.mockResolvedValue([upcoming()]);
    const { i18n } = renderWithProviders(<LiveBroadcaster />);
    const t = i18n!.t;
    fireEvent.click(
      await screen.findByRole('button', {
        name: t('live.schedule.upcoming_button', { count: 1 }),
      }),
    );
    const sheet = await screen.findByRole('dialog', {
      name: t('live.schedule.upcoming_title'),
    });
    expect(within(sheet).getByText('Sunday chat')).toBeInTheDocument();
    expect(
      within(sheet).getByText(t('live.schedule.reminders', { count: 2 })),
    ).toBeInTheDocument();
    fireEvent.click(
      within(sheet).getByRole('button', { name: t('live.schedule.start_now') }),
    );

    expect(
      await screen.findByRole('button', { name: t('live.end_stream') }),
    ).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/live/start', {
      scheduledLiveId: 'sl-1',
    });
    expect(live.listScheduled).toHaveBeenCalledWith('me');
  });

  it('cancels an upcoming live only after a confirmation', async () => {
    live.listScheduled.mockResolvedValue([upcoming()]);
    live.cancelScheduled.mockResolvedValue({ success: true });
    const { i18n } = renderWithProviders(<LiveBroadcaster />);
    const t = i18n!.t;
    fireEvent.click(
      await screen.findByRole('button', {
        name: t('live.schedule.upcoming_button', { count: 1 }),
      }),
    );
    const sheet = await screen.findByRole('dialog', {
      name: t('live.schedule.upcoming_title'),
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: t('live.schedule.cancel') }),
    );
    expect(live.cancelScheduled).not.toHaveBeenCalled();
    // The sheet makes way for the confirmation.
    const confirm = await screen.findByRole('dialog');
    expect(confirm).toHaveTextContent(t('live.schedule.cancel_confirm_title'));
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: t('live.schedule.cancel_confirm'),
      }),
    );
    await waitFor(() =>
      expect(live.cancelScheduled).toHaveBeenCalledWith('sl-1'),
    );
    expect(toast.success).toHaveBeenCalledWith(t('live.schedule.cancelled'));
  });

  it('offers no upcoming lives when there are none', async () => {
    const { i18n } = renderWithProviders(<LiveBroadcaster />);
    await waitFor(() => expect(live.listScheduled).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('live.schedule.upcoming_button', { count: 1 }),
      }),
    ).not.toBeInTheDocument();
  });
});
