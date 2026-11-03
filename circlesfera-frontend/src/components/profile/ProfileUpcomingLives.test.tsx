import { LIVE_REMINDER_LEAD_MINUTES } from '@circlesfera/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledLive } from '../../services/live';
import { renderWithProviders } from '../../test/test-utils';
import { formatLiveStart } from '../../utils/liveSchedule';
import ProfileUpcomingLives from './ProfileUpcomingLives';

const api = vi.hoisted(() => ({
  listScheduled: vi.fn(),
  cancelScheduled: vi.fn(),
  remind: vi.fn(),
  unremind: vi.fn(),
}));
vi.mock('../../services/live', () => ({ liveApi: api }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast }));

const live = (over: Partial<ScheduledLive> = {}): ScheduledLive => ({
  id: 'sl-1',
  hostId: 'host-1',
  title: 'Sunday chat',
  audience: 'EVERYONE',
  startsAt: '2026-11-09T18:30:00.000Z',
  status: 'SCHEDULED',
  reminded: false,
  ...over,
});

describe('ProfileUpcomingLives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.remind.mockResolvedValue({ reminded: true });
    api.unremind.mockResolvedValue({ reminded: false });
    api.cancelScheduled.mockResolvedValue({ success: true });
  });

  it('shows nothing when there is no upcoming live', async () => {
    api.listScheduled.mockResolvedValue([]);
    const { container } = renderWithProviders(
      <ProfileUpcomingLives profileId="host-1" isMe={false} />,
    );
    await waitFor(() => expect(api.listScheduled).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each live as a card of its own, with its date and time in the reader language', async () => {
    api.listScheduled.mockResolvedValue([
      live(),
      live({ id: 'sl-2', title: 'Q&A', startsAt: '2026-11-20T10:00:00Z' }),
    ]);
    const { i18n } = renderWithProviders(
      <ProfileUpcomingLives profileId="host-1" isMe={false} />,
      { lng: 'es' },
    );
    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Sunday chat')).toBeInTheDocument();
    expect(
      within(cards[0]).getByText(
        formatLiveStart('2026-11-09T18:30:00.000Z', 'es'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: i18n!.t('profile.upcoming_lives.title'),
      }),
    ).toBeInTheDocument();
    expect(api.listScheduled).toHaveBeenCalledWith('host-1');
  });

  it('lets a viewer set a reminder and take it back', async () => {
    api.listScheduled.mockResolvedValue([live()]);
    const { i18n } = renderWithProviders(
      <ProfileUpcomingLives profileId="host-1" isMe={false} />,
    );
    const t = i18n!.t;
    fireEvent.click(
      await screen.findByRole('button', { name: t('live.schedule.remind') }),
    );
    const set = await screen.findByRole('button', {
      name: t('live.schedule.reminded'),
    });
    expect(api.remind).toHaveBeenCalledWith('sl-1');
    expect(toast.success).toHaveBeenCalledWith(
      t('live.schedule.reminded_toast', {
        min: LIVE_REMINDER_LEAD_MINUTES,
      }),
    );

    fireEvent.click(set);
    expect(
      await screen.findByRole('button', { name: t('live.schedule.remind') }),
    ).toBeInTheDocument();
    expect(api.unremind).toHaveBeenCalledWith('sl-1');
    // The host's actions are never offered to a viewer.
    expect(
      screen.queryByRole('button', { name: t('live.schedule.cancel') }),
    ).not.toBeInTheDocument();
  });

  it('goes back and says why when a reminder is refused', async () => {
    api.listScheduled.mockResolvedValue([live()]);
    api.remind.mockRejectedValue({
      status: 404,
      data: { errorCode: 'SCHEDULED_LIVE_NOT_FOUND' },
    });
    const { i18n } = renderWithProviders(
      <ProfileUpcomingLives profileId="host-1" isMe={false} />,
    );
    const t = i18n!.t;
    fireEvent.click(
      await screen.findByRole('button', { name: t('live.schedule.remind') }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        t('errors.codes.SCHEDULED_LIVE_NOT_FOUND'),
      ),
    );
    expect(
      await screen.findByRole('button', { name: t('live.schedule.remind') }),
    ).toBeInTheDocument();
  });

  it('shows the host how many asked to be reminded, and cancels after a confirmation', async () => {
    api.listScheduled.mockResolvedValue([
      live({ reminderCount: 3, audience: 'CLOSE_FRIENDS' }),
    ]);
    const { i18n } = renderWithProviders(
      <ProfileUpcomingLives profileId="host-1" isMe />,
    );
    const t = i18n!.t;
    expect(
      await screen.findByText(t('live.schedule.reminders', { count: 3 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('live.audience.CLOSE_FRIENDS'), { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('live.schedule.remind') }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: t('live.schedule.cancel') }),
    );
    expect(api.cancelScheduled).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: t('live.schedule.cancel_confirm'),
      }),
    );
    await waitFor(() =>
      expect(api.cancelScheduled).toHaveBeenCalledWith('sl-1'),
    );
    expect(toast.success).toHaveBeenCalledWith(t('live.schedule.cancelled'));
  });
});
