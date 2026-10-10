import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import { VoiceRecorder } from './VoiceRecorder';

vi.mock('../../services/api', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn() } }));

/** The microphone and the recorder, as the browser would give them. */
let track: { stop: ReturnType<typeof vi.fn> };
let recorder: FakeRecorder;
let preview: {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  onended?: () => void;
};

class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  // The browser hands the audio over a moment after `stop`, not inside it.
  stop = vi.fn(() => {
    this.state = 'inactive';
  });
  constructor() {
    recorder = this;
  }
  /** The recorder has finished and hands over what it has. */
  finish() {
    this.ondataavailable?.({ data: new Blob(['sound']) });
    this.onstop?.();
  }
}

function show(props: Partial<Parameters<typeof VoiceRecorder>[0]> = {}) {
  const onSendVoice = vi.fn();
  const onCancel = vi.fn();
  const view = renderWithProviders(
    <VoiceRecorder onSendVoice={onSendVoice} onCancel={onCancel} {...props} />,
  );
  return { onSendVoice, onCancel, ...view };
}

const start = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Record voice' }));
  await waitFor(() => expect(recorder?.start).toHaveBeenCalled());
};
/** Stops and lets the recorder hand its audio over. */
const stop = () => {
  fireEvent.click(screen.getByTitle('Stop recording'));
  act(() => recorder.finish());
};

describe('VoiceRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    track = { stop: vi.fn() };
    recorder = undefined as unknown as FakeRecorder;
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }),
      },
    });
    // No sound analysis in these tests: the recorder works without it.
    vi.stubGlobal('AudioContext', undefined);
    preview = { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    vi.stubGlobal(
      'Audio',
      vi.fn(function Audio() {
        return preview;
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:note');
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { url: 'https://cdn/note.webm' },
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks for the microphone only, and starts recording', async () => {
    show();

    await start();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: true,
    });
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByTitle('Stop recording')).toBeInTheDocument();
  });

  it('stays idle when the microphone is refused', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new Error('NotAllowedError'),
    );
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Record voice' }));

    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled(),
    );
    expect(
      screen.getByRole('button', { name: 'Record voice' }),
    ).toBeInTheDocument();
    expect(screen.queryByTitle('Stop recording')).not.toBeInTheDocument();
  });

  it('counts the time while it records', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show();
    await start();

    act(() => {
      vi.advanceTimersByTime(65_000);
    });

    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  describe('stopping', () => {
    it('releases the microphone and leaves the note ready', async () => {
      show();
      await start();

      stop();

      expect(recorder.stop).toHaveBeenCalledTimes(1);
      expect(track.stop).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Ready/)).toBeInTheDocument();
      expect(screen.getByTitle('Send voice note')).toBeInTheDocument();
    });

    it('plays the note back and pauses it', async () => {
      show();
      await start();
      stop();

      fireEvent.click(screen.getByTitle('Play draft'));
      expect(await screen.findByTitle('Pause preview')).toBeInTheDocument();
      expect(preview.play).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTitle('Pause preview'));
      expect(preview.pause).toHaveBeenCalled();
      expect(screen.getByTitle('Play draft')).toBeInTheDocument();
    });

    it('shows play again when the note has been heard to the end', async () => {
      show();
      await start();
      stop();
      fireEvent.click(screen.getByTitle('Play draft'));
      await screen.findByTitle('Pause preview');

      act(() => preview.onended?.());

      expect(screen.getByTitle('Play draft')).toBeInTheDocument();
    });
  });

  describe('cancelling', () => {
    it('discards a recording in progress, also once the recorder hands it over', async () => {
      const { onCancel } = show();
      await start();

      fireEvent.click(screen.getByTitle('Cancel'));
      act(() => recorder.finish());

      expect(recorder.stop).toHaveBeenCalledTimes(1);
      expect(track.stop).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
      // Back to the start: nothing to play or to send.
      expect(
        screen.getByRole('button', { name: 'Record voice' }),
      ).toBeInTheDocument();
      expect(screen.queryByTitle('Send voice note')).not.toBeInTheDocument();
    });

    it('discards a note that was ready, and stops its playback', async () => {
      const { onCancel } = show();
      await start();
      stop();
      fireEvent.click(screen.getByTitle('Play draft'));
      await screen.findByTitle('Pause preview');

      fireEvent.click(screen.getByTitle('Discard'));

      expect(preview.pause).toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('button', { name: 'Record voice' }),
      ).toBeInTheDocument();
    });

    it('records a new note after a cancelled one', async () => {
      show();
      await start();
      fireEvent.click(screen.getByTitle('Cancel'));
      act(() => recorder.finish());

      await start();
      stop();

      expect(screen.getByTitle('Send voice note')).toBeInTheDocument();
    });
  });

  describe('leaving the screen', () => {
    it('releases the microphone when it happens while recording', async () => {
      const { unmount } = show();
      await start();

      unmount();

      expect(recorder.stop).toHaveBeenCalledTimes(1);
      expect(track.stop).toHaveBeenCalledTimes(1);
    });

    it('does not stop a recorder that had already stopped', async () => {
      const { unmount } = show();
      await start();
      stop();

      unmount();

      expect(recorder.stop).toHaveBeenCalledTimes(1);
    });

    it('stops the playback of a note that was being heard', async () => {
      const { unmount } = show();
      await start();
      stop();
      fireEvent.click(screen.getByTitle('Play draft'));
      await screen.findByTitle('Pause preview');

      unmount();

      expect(preview.pause).toHaveBeenCalled();
    });
  });

  describe('sending', () => {
    it('uploads the note and hands over its address, its length and its wave', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { onSendVoice } = show();
      await start();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      stop();

      fireEvent.click(screen.getByTitle('Send voice note'));

      await waitFor(() => expect(onSendVoice).toHaveBeenCalledTimes(1));
      const [path, form] = vi.mocked(apiClient.post).mock.calls[0];
      expect(path).toBe('uploads/file');
      expect((form as FormData).get('file')).toBeInstanceOf(Blob);
      const sent = onSendVoice.mock.calls[0][0];
      expect(sent.voiceUrl).toBe('https://cdn/note.webm');
      expect(sent.voiceDuration).toBe(4);
      expect(sent.voiceWaveform).toHaveLength(20);
      // Back to the start, ready for another note.
      expect(
        await screen.findByRole('button', { name: 'Record voice' }),
      ).toBeInTheDocument();
    });

    it('never says a note lasts less than a second', async () => {
      const { onSendVoice } = show();
      await start();
      stop();

      fireEvent.click(screen.getByTitle('Send voice note'));

      await waitFor(() => expect(onSendVoice).toHaveBeenCalled());
      expect(onSendVoice.mock.calls[0][0].voiceDuration).toBe(1);
    });

    it('keeps the note when it cannot be uploaded', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('offline'));
      const { onSendVoice } = show();
      await start();
      stop();

      fireEvent.click(screen.getByTitle('Send voice note'));

      expect(await screen.findByTitle('Send voice note')).toBeInTheDocument();
      expect(onSendVoice).not.toHaveBeenCalled();
    });
  });

  it('shows only the microphone in tight places', () => {
    show({ compact: true });

    const button = screen.getByRole('button', { name: 'Record voice' });
    expect(button).toHaveClass('w-11', 'h-11');
    expect(button).toHaveTextContent('');
  });
});
