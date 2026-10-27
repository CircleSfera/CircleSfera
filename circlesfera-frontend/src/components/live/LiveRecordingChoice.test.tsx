import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRecording } from '../../services/liveRecordings';
import { renderWithProviders } from '../../test/test-utils';
import LiveRecordingChoice from './LiveRecordingChoice';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  publish: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../../services/liveRecordings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/liveRecordings')>()),
  liveRecordingsApi: api,
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast }));

const recording = (over: Partial<LiveRecording> = {}): LiveRecording => ({
  id: 's1',
  title: 'Hello',
  startedAt: '2026-10-27T10:00:00Z',
  endedAt: '2026-10-27T11:00:00Z',
  recordingStatus: 'READY',
  recordingDurationMs: 3_600_000,
  replayUrl: '/uploads/x/master.m3u8',
  thumbnailUrl: null,
  publishedAt: null,
  daysLeft: 30,
  ...over,
});

describe('LiveRecordingChoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.publish.mockResolvedValue({ publishedAt: 'now' });
    api.remove.mockResolvedValue({ success: true });
  });

  it('shows nothing where the live was not recorded at all', async () => {
    api.get.mockResolvedValue(recording({ recordingStatus: 'NONE' }));
    const { container } = renderWithProviders(
      <LiveRecordingChoice streamId="s1" />,
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('s1'));
    expect(container).toBeEmptyDOMElement();
  });

  it('says the recording is being prepared, with no choice yet', async () => {
    api.get.mockResolvedValue(recording({ recordingStatus: 'PROCESSING' }));
    renderWithProviders(<LiveRecordingChoice streamId="s1" />);
    expect(
      await screen.findByText(/Your recording is being prepared/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    ['SKIPPED_LIMIT', /too many lives were being recorded/],
    ['FAILED', /couldn’t be recorded/],
  ] as const)('says why a live was not recorded (%s)', async (status, line) => {
    api.get.mockResolvedValue(recording({ recordingStatus: status }));
    renderWithProviders(<LiveRecordingChoice streamId="s1" />);
    expect(await screen.findByText(line)).toBeInTheDocument();
  });

  it('publishes a ready recording on the profile', async () => {
    api.get.mockResolvedValue(recording());
    renderWithProviders(<LiveRecordingChoice streamId="s1" />);
    expect(await screen.findByText(/for 30 days/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish on my profile' }),
    );
    expect(
      await screen.findByText('Published on your profile.'),
    ).toBeInTheDocument();
    expect(api.publish).toHaveBeenCalledWith('s1');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('deletes a ready recording once confirmed', async () => {
    api.get.mockResolvedValue(recording({ daysLeft: null }));
    renderWithProviders(<LiveRecordingChoice streamId="s1" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete recording' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(
        (button) => button.textContent === 'Delete recording',
      ) as HTMLButtonElement,
    );
    expect(await screen.findByText('Recording deleted.')).toBeInTheDocument();
    expect(api.remove).toHaveBeenCalledWith('s1');
  });

  it('says so when a choice fails', async () => {
    api.get.mockResolvedValue(recording());
    api.publish.mockRejectedValue(new Error('down'));
    api.remove.mockRejectedValue(new Error('down'));
    renderWithProviders(<LiveRecordingChoice streamId="s1" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Publish on my profile' }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The recording couldn’t be published. Try again.',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete recording' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(
        (button) => button.textContent === 'Delete recording',
      ) as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The recording couldn’t be deleted. Try again.',
      ),
    );
  });
});
