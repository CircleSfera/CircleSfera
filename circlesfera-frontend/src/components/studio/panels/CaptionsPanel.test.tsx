import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import { useExperimentStore } from '../../../stores/useExperimentStore';
import {
  mediaClip,
  openStudioProject,
  studioClips,
  studioTrack,
  textClip,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import type { TextClip } from '../../../types/studio';
import CaptionsPanel from './CaptionsPanel';

const mocks = vi.hoisted(() => ({
  startCaptions: vi.fn(),
  pollCaptionsJob: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({ toast: mocks.toast }));
vi.mock('../../../services/edits.service', () => ({
  editsService: { startCaptions: mocks.startCaptions },
}));
vi.mock('../../../utils/studioCaptions', () => ({
  pollCaptionsJob: mocks.pollCaptionsJob,
}));

const texts = () =>
  studioClips().filter((c) => c.type === 'text') as TextClip[];

/** A saved project with one uploaded video selected: all it takes to ask. */
function openReady(state: Parameters<typeof openStudioProject>[1] = {}) {
  openStudioProject(
    [
      studioTrack('v1', 'video', [mediaClip('clip')]),
      studioTrack('t1', 'text'),
    ],
    { cloudProjectId: 'cloud-1', selectedClipId: 'clip', ...state },
  );
}

const generate = () =>
  screen.getByRole('button', { name: 'Generate AI captions' });

describe('CaptionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExperimentStore.setState({ flags: {}, isLoaded: true });
    mocks.startCaptions.mockResolvedValue({ jobId: 'job-1' });
  });

  describe('a caption written by hand', () => {
    it('lands on the text track where the playhead is, for two and a half seconds', () => {
      openReady({ playhead: 4 });
      renderWithProviders(<CaptionsPanel />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Add caption at playhead' }),
      );

      expect(texts()).toEqual([
        expect.objectContaining({
          trackId: 't1',
          content: 'New caption',
          startAt: 4,
          duration: 2.5,
        }),
      ]);
      expect(mocks.toast.success).toHaveBeenCalledWith('Caption added');
    });

    it('goes to the first track when the project has no text track', () => {
      openStudioProject([studioTrack('v1', 'video')]);
      renderWithProviders(<CaptionsPanel />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Add caption at playhead' }),
      );

      expect(texts()[0].trackId).toBe('v1');
    });

    it('does nothing without a project', () => {
      useStudioStore.setState({ project: null });
      renderWithProviders(<CaptionsPanel />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Add caption at playhead' }),
      );

      expect(mocks.toast.success).not.toHaveBeenCalled();
    });
  });

  describe('what it takes to ask for automatic captions', () => {
    it('asks to save first when the project is not in the cloud', () => {
      openReady({ cloudProjectId: null });
      renderWithProviders(<CaptionsPanel />);

      expect(
        screen.getByText('Save the project first so media is in the cloud'),
      ).toBeInTheDocument();
      expect(generate()).toBeDisabled();
    });

    it('asks for a clip with sound when none is selected', () => {
      openReady({ selectedClipId: null });
      renderWithProviders(<CaptionsPanel />);

      expect(
        screen.getByText('Select a video or audio clip first'),
      ).toBeInTheDocument();
      expect(generate()).toBeDisabled();
    });

    it('does not count a text clip as a clip with sound', () => {
      openStudioProject([studioTrack('t1', 'text', [textClip('words')])], {
        cloudProjectId: 'cloud-1',
        selectedClipId: 'words',
      });
      renderWithProviders(<CaptionsPanel />);

      expect(
        screen.getByText('Select a video or audio clip first'),
      ).toBeInTheDocument();
    });

    it('asks to wait while the clip is still only on the device', () => {
      openStudioProject(
        [
          studioTrack('v1', 'video', [
            mediaClip('clip', { fileUrl: 'blob:local' }),
          ]),
        ],
        { cloudProjectId: 'cloud-1', selectedClipId: 'clip' },
      );
      renderWithProviders(<CaptionsPanel />);

      expect(
        screen.getByText('Wait for the clip to finish uploading'),
      ).toBeInTheDocument();
      expect(generate()).toBeDisabled();
    });

    it('offers it with no hint once everything is in place', () => {
      openReady();
      renderWithProviders(<CaptionsPanel />);

      expect(generate()).toBeEnabled();
      expect(screen.queryByText(/first|Wait for/)).not.toBeInTheDocument();
    });
  });

  describe('when automatic captions are switched off', () => {
    it('says so and offers no button', () => {
      useExperimentStore.setState({
        flags: { studio_ai_captions: false },
        isLoaded: true,
      });
      openReady();
      renderWithProviders(<CaptionsPanel />);

      expect(
        screen.getByText('AI captions are temporarily unavailable'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Generate AI captions' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add caption at playhead' }),
      ).toBeInTheDocument();
    });

    it('keeps offering it until the switches have been read', () => {
      useExperimentStore.setState({
        flags: { studio_ai_captions: false },
        isLoaded: false,
      });
      openReady();
      renderWithProviders(<CaptionsPanel />);

      expect(generate()).toBeInTheDocument();
    });
  });

  describe('asking for automatic captions', () => {
    it('places each caption on the timeline where it is spoken in the clip', async () => {
      mocks.pollCaptionsJob.mockResolvedValue([
        { start: 0, end: 1.5, text: ' Hello there ' },
        { start: 3, end: 4, text: 'Again' },
      ]);
      openReady();
      renderWithProviders(<CaptionsPanel />);

      fireEvent.click(generate());

      await waitFor(() => expect(texts()).toHaveLength(2));
      expect(mocks.startCaptions).toHaveBeenCalledWith('cloud-1', 'clip');
      expect(mocks.pollCaptionsJob).toHaveBeenCalledWith(
        'cloud-1',
        'job-1',
        expect.any(AbortSignal),
      );
      // The clip starts at second two of the timeline.
      expect(texts()).toEqual([
        expect.objectContaining({
          trackId: 't1',
          content: 'Hello there',
          startAt: 2,
          duration: 1.5,
        }),
        expect.objectContaining({ content: 'Again', startAt: 5, duration: 1 }),
      ]);
      expect(mocks.toast.success).toHaveBeenCalledWith('2 captions added');
      expect(generate()).toBeEnabled();
    });

    it('shows that it is working and offers to cancel meanwhile', async () => {
      let finish: (segments: never[]) => void = () => {};
      mocks.pollCaptionsJob.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      openReady();
      renderWithProviders(<CaptionsPanel />);

      fireEvent.click(generate());

      expect(
        await screen.findByRole('button', { name: 'Cancel transcription' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Transcribing…')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Generate AI captions' }),
      ).not.toBeInTheDocument();

      await act(async () => finish([]));
      expect(
        await screen.findByRole('button', { name: 'Generate AI captions' }),
      ).toBeInTheDocument();
    });

    it('still adds the captions of the clip when another one is selected meanwhile', async () => {
      let finish: (segments: unknown[]) => void = () => {};
      mocks.pollCaptionsJob.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      openStudioProject(
        [
          studioTrack('v1', 'video', [
            mediaClip('clip'),
            mediaClip('later', { startAt: 10 }),
          ]),
          studioTrack('t1', 'text'),
        ],
        { cloudProjectId: 'cloud-1', selectedClipId: 'clip' },
      );
      renderWithProviders(<CaptionsPanel />);

      fireEvent.click(generate());
      await screen.findByRole('button', { name: 'Cancel transcription' });
      act(() => useStudioStore.setState({ selectedClipId: null }));
      await act(async () => finish([{ start: 1, end: 2, text: 'Hi' }]));

      await waitFor(() => expect(texts()).toHaveLength(1));
      expect(texts()[0]).toMatchObject({ content: 'Hi', startAt: 3 });
      expect(mocks.toast.success).toHaveBeenCalledWith('1 captions added');
    });

    it('stops the wait when cancelled and says it was cancelled', async () => {
      mocks.pollCaptionsJob.mockImplementation(
        (_project: string, _job: string, signal: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new Error('studio.captions.cancelled')),
            );
          }),
      );
      openReady();
      renderWithProviders(<CaptionsPanel />);

      fireEvent.click(generate());
      fireEvent.click(
        await screen.findByRole('button', { name: 'Cancel transcription' }),
      );

      await waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith(
          'Caption generation cancelled',
        ),
      );
      expect(mocks.toast.error).not.toHaveBeenCalled();
      expect(texts()).toHaveLength(0);
      expect(generate()).toBeEnabled();
    });

    it.each([
      ['studio.captions.timeout', 'Caption transcription timed out'],
      ['studio.captions.error', 'Could not generate captions'],
      ['The service is busy', 'The service is busy'],
      ['', 'Could not generate captions'],
    ])(
      'says what went wrong when it fails with "%s"',
      async (message, shown) => {
        mocks.pollCaptionsJob.mockRejectedValue(new Error(message));
        openReady();
        renderWithProviders(<CaptionsPanel />);

        fireEvent.click(generate());

        await waitFor(() =>
          expect(mocks.toast.error).toHaveBeenCalledWith(shown),
        );
        expect(texts()).toHaveLength(0);
        expect(generate()).toBeEnabled();
      },
    );

    it('says what went wrong when the request itself is refused', async () => {
      mocks.startCaptions.mockRejectedValue(new Error('studio.captions.error'));
      openReady();
      renderWithProviders(<CaptionsPanel />);

      fireEvent.click(generate());

      await waitFor(() =>
        expect(mocks.toast.error).toHaveBeenCalledWith(
          'Could not generate captions',
        ),
      );
      expect(mocks.pollCaptionsJob).not.toHaveBeenCalled();
    });
  });
});
