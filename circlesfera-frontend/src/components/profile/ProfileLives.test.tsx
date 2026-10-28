import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRecording } from '../../services/liveRecordings';
import { renderWithProviders } from '../../test/test-utils';
import ProfileLives from './ProfileLives';

const api = vi.hoisted(() => ({
  listMine: vi.fn(),
  listPublished: vi.fn(),
  publish: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../../services/liveRecordings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/liveRecordings')>()),
  liveRecordingsApi: api,
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast }));
vi.mock('../common/HlsVideoPlayer', () => ({
  default: (props: { hlsUrl?: string; 'aria-label'?: string }) => (
    <div role="img" aria-label={props['aria-label']} data-src={props.hlsUrl} />
  ),
}));

const recording = (over: Partial<LiveRecording> = {}): LiveRecording => ({
  id: 's1',
  title: 'Morning chat',
  startedAt: '2026-10-27T10:00:00Z',
  endedAt: '2026-10-27T11:00:00Z',
  recordingStatus: 'READY',
  recordingDurationMs: 125_000,
  replayUrl: '/uploads/x/master.m3u8',
  thumbnailUrl: '/uploads/x/thumb.jpg',
  publishedAt: '2026-10-27T11:05:00Z',
  daysLeft: null,
  ...over,
});

describe('ProfileLives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listMine.mockResolvedValue([]);
    api.listPublished.mockResolvedValue({ data: [], nextCursor: null });
    api.publish.mockResolvedValue({ publishedAt: 'now' });
    api.remove.mockResolvedValue({ success: true });
  });

  it("lists another Profile's published lives, and plays one upright", async () => {
    api.listPublished.mockResolvedValue({
      data: [recording()],
      nextCursor: null,
    });
    renderWithProviders(<ProfileLives profileId="p2" isMe={false} />);

    const tile = await screen.findByRole('button', {
      name: 'Play Morning chat',
    });
    expect(within(tile).getByText('2:05')).toBeInTheDocument();
    expect(api.listMine).not.toHaveBeenCalled();
    expect(api.listPublished).toHaveBeenCalledWith('p2', undefined);

    fireEvent.click(tile);
    const player = await screen.findByLabelText('Recording of the live');
    expect(player).toHaveAttribute('data-src', '/uploads/x/master.m3u8');
  });

  it('says there are none yet', async () => {
    renderWithProviders(<ProfileLives profileId="p2" isMe={false} />);
    expect(await screen.findByText('No lives yet')).toBeInTheDocument();
    expect(
      screen.queryByText('Lives you publish after they end appear here.'),
    ).not.toBeInTheDocument();
  });

  it('offers to try again when the lives cannot be loaded, instead of saying there are none', async () => {
    api.listPublished.mockRejectedValue(new Error('down'));
    renderWithProviders(<ProfileLives profileId="p2" isMe={false} />);
    expect(
      await screen.findByRole('button', { name: /try again|retry/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No lives yet')).not.toBeInTheDocument();
  });

  it('loads the next page when asked', async () => {
    api.listPublished
      .mockResolvedValueOnce({
        data: [recording({ title: null })],
        nextCursor: 's1',
      })
      .mockResolvedValueOnce({
        data: [recording({ id: 's2', recordingDurationMs: 3_725_000 })],
        nextCursor: null,
      });
    renderWithProviders(<ProfileLives profileId="p2" isMe={false} />);
    expect(
      await screen.findByRole('button', { name: 'Play Live' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('1:02:05')).toBeInTheDocument();
    expect(api.listPublished).toHaveBeenLastCalledWith('p2', 's1');
  });

  it('shows the owner their archive with the days left, and publishes from it', async () => {
    api.listMine.mockResolvedValue([
      recording({ id: 'k1', publishedAt: null, daysLeft: 1 }),
      recording({
        id: 'k2',
        title: 'Second',
        publishedAt: null,
        daysLeft: 12,
        recordingStatus: 'PROCESSING',
        thumbnailUrl: null,
      }),
    ]);
    renderWithProviders(<ProfileLives profileId="p1" isMe />);

    expect(await screen.findByText('Your archive')).toBeInTheDocument();
    expect(screen.getByText('1 day left')).toBeInTheDocument();
    expect(screen.getByText('12 days left')).toBeInTheDocument();
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Second' })).toBeDisabled();
    expect(
      screen.getByText('Lives you publish after they end appear here.'),
    ).toBeInTheDocument();

    // Only the ready one can be published or deleted.
    const publishButtons = screen.getAllByRole('button', { name: 'Publish' });
    expect(publishButtons).toHaveLength(1);
    fireEvent.click(publishButtons[0]);
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith('k1'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Published on your profile.'),
    );
  });

  it('deletes from the archive once confirmed, and says when it fails', async () => {
    api.listMine.mockResolvedValue([
      recording({ id: 'k1', publishedAt: null, daysLeft: 3 }),
    ]);
    renderWithProviders(<ProfileLives profileId="p1" isMe />);

    const confirm = async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Delete recording' }),
      );
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(
        Array.from(dialog.querySelectorAll('button')).find(
          (button) => button.textContent === 'Delete recording',
        ) as HTMLButtonElement,
      );
    };
    await confirm();
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('k1'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Recording deleted.'),
    );

    api.remove.mockRejectedValue(new Error('down'));
    api.publish.mockRejectedValue(new Error('down'));
    await confirm();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The recording couldn’t be deleted. Try again.',
      ),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The recording couldn’t be published. Try again.',
      ),
    );
  });
});
