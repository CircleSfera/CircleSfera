import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioApi } from '../../../services/audio.service';
import { useStudioStore } from '../../../stores/studioStore';
import {
  mediaClip,
  openStudioProject,
  studioTrack,
  textClip,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import type { MediaClip } from '../../../types/studio';
import AudioPanel from './AudioPanel';
import ClipFadesPanel from './ClipFadesPanel';
import ProjectSettingsPanel from './ProjectSettingsPanel';
import VoicePanel, { VOICE_COUNTDOWN_SEC } from './VoicePanel';

vi.mock('../../../services/audio.service', () => ({
  audioApi: { getTrending: vi.fn(), search: vi.fn() },
}));

const store = () => useStudioStore.getState();
const song = (id: string, title: string) => ({
  id,
  title,
  artist: 'Artist',
  url: `https://cdn/${id}.mp3`,
  duration: 75,
});

describe('the music panel', () => {
  const played: string[] = [];
  beforeEach(() => {
    vi.clearAllMocks();
    played.length = 0;
    vi.mocked(audioApi.getTrending).mockResolvedValue({
      data: [song('a1', 'Sunrise'), song('a2', 'Nightfall')],
    } as never);
    vi.mocked(audioApi.search).mockResolvedValue({
      data: [song('a3', 'Found')],
    } as never);
    vi.stubGlobal(
      'Audio',
      vi.fn(function (this: Record<string, unknown>, url: string) {
        played.push(url);
        this.play = vi.fn().mockResolvedValue(undefined);
        this.pause = vi.fn();
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists the popular songs, plays one before it is chosen, and adds it', async () => {
    const onAdd = vi.fn();
    renderWithProviders(
      <AudioPanel onAddAudioFile={vi.fn()} onAddLibraryAudio={onAdd} />,
    );
    expect(await screen.findByText('Sunrise')).toBeInTheDocument();
    expect(screen.getByText('Popular')).toBeInTheDocument();
    expect(screen.getAllByText(/Artist · 1:15/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Listen to Sunrise' }));
    expect(played).toEqual(['https://cdn/a1.mp3']);
    fireEvent.click(screen.getByRole('button', { name: 'Stop Sunrise' }));
    expect(
      screen.getByRole('button', { name: 'Listen to Sunrise' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Nightfall' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'a2' }));
  });

  it('finds songs by name', async () => {
    renderWithProviders(
      <AudioPanel onAddAudioFile={vi.fn()} onAddLibraryAudio={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('Search songs'), {
      target: { value: 'fou' },
    });
    expect(await screen.findByText('Found')).toBeInTheDocument();
    expect(audioApi.search).toHaveBeenCalledWith('fou');
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('says when there are none, or they cannot be loaded', async () => {
    vi.mocked(audioApi.getTrending).mockResolvedValueOnce({
      data: [],
    } as never);
    const empty = renderWithProviders(
      <AudioPanel onAddAudioFile={vi.fn()} onAddLibraryAudio={vi.fn()} />,
    );
    expect(await screen.findByText('No songs.')).toBeInTheDocument();
    empty.unmount();
    vi.mocked(audioApi.getTrending).mockRejectedValueOnce(new Error('down'));
    renderWithProviders(
      <AudioPanel onAddAudioFile={vi.fn()} onAddLibraryAudio={vi.fn()} />,
    );
    expect(
      await screen.findByText('The songs could not be loaded.'),
    ).toBeInTheDocument();
  });

  it('still takes a file from the device', async () => {
    const onFile = vi.fn();
    const { container } = renderWithProviders(
      <AudioPanel onAddAudioFile={onFile} onAddLibraryAudio={vi.fn()} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clicked = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: /Upload/ }));
    expect(clicked).toHaveBeenCalled();
    const file = new File(['s'], 's.mp3', { type: 'audio/mpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
    await waitFor(() => expect(audioApi.getTrending).toHaveBeenCalled());
  });
});

describe('the fades panel', () => {
  beforeEach(() => {
    openStudioProject([
      studioTrack('v1', 'video', [
        mediaClip('v', { trackId: 'v1', startAt: 0, duration: 10 }),
      ]),
      studioTrack('t1', 'text', [textClip('w', { trackId: 't1' })]),
    ]);
  });
  const clip = () => store().project?.tracks[0].clips[0] as MediaClip;

  it('sets the fade in and out, one step of undo per drag', () => {
    useStudioStore.setState({ selectedClipId: 'v', past: [] });
    renderWithProviders(<ClipFadesPanel />);
    const [fadeIn, fadeOut] = screen.getAllByRole('slider');
    fireEvent.change(fadeIn, { target: { value: '1' } });
    fireEvent.change(fadeIn, { target: { value: '1.5' } });
    fireEvent.pointerUp(fadeIn);
    expect(clip().fadeIn).toBe(1.5);
    expect(store().past).toHaveLength(1);
    fireEvent.change(fadeOut, { target: { value: '2' } });
    fireEvent.keyUp(fadeOut);
    fireEvent.blur(fadeOut);
    expect(clip().fadeOut).toBe(2);
    expect(screen.getByText('2.0 s')).toBeInTheDocument();
    expect(store().past).toHaveLength(2);
  });

  it('shows nothing for a text or with nothing chosen', () => {
    useStudioStore.setState({ selectedClipId: 'w' });
    expect(
      renderWithProviders(<ClipFadesPanel />).container,
    ).toBeEmptyDOMElement();
    useStudioStore.setState({ selectedClipId: null });
    expect(
      renderWithProviders(<ClipFadesPanel />).container,
    ).toBeEmptyDOMElement();
  });
});

describe('the project settings, for sound', () => {
  it('turns the drop under a voice off and on', () => {
    openStudioProject([studioTrack('v1', 'video')]);
    renderWithProviders(<ProjectSettingsPanel />);
    const toggle = screen.getByRole('switch', {
      name: /Lower music under voice/,
    });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(store().project?.duckUnderVoice).toBe(false);
    fireEvent.click(toggle);
    expect(store().project?.duckUnderVoice).toBe(true);
  });
});

describe('the voice panel', () => {
  let recorders: Record<string, any>[];
  let stopped: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    recorders = [];
    stopped = vi.fn();
    openStudioProject(
      [
        studioTrack('v1', 'video', [
          mediaClip('v', { trackId: 'v1', startAt: 0, duration: 10 }),
        ]),
      ],
      {
        playhead: 2,
      },
    );
    useStudioStore.setState((s) => ({
      project: s.project ? { ...s.project, duration: 10 } : null,
    }));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockResolvedValue({ getTracks: () => [{ stop: stopped }] }),
      },
    });
    vi.stubGlobal(
      'MediaRecorder',
      Object.assign(
        vi.fn(function (this: Record<string, any>) {
          this.state = 'inactive';
          this.mimeType = 'audio/webm';
          this.start = () => {
            this.state = 'recording';
          };
          this.stop = () => {
            this.state = 'inactive';
            this.ondataavailable?.({ data: new Blob(['x']) });
            this.onstop?.();
          };
          recorders.push(this);
        }),
        { isTypeSupported: (type: string) => type === 'audio/webm' },
      ),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('counts down, records over the silent video from the playhead, and hands the recording over', async () => {
    const onRecorded = vi.fn();
    renderWithProviders(<VoicePanel onRecorded={onRecorded} />);
    expect(screen.getByText(/Records from 0:02.0/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    });
    expect(
      screen.getByText(`Starting in ${VOICE_COUNTDOWN_SEC}…`),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(VOICE_COUNTDOWN_SEC * 1000));
    expect(store()).toMatchObject({ isRecordingVoice: true, isPlaying: true });
    act(() => store().setPlayhead(5));
    expect(screen.getByText(/Recording · 0:03.0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onRecorded).toHaveBeenCalledWith({
      blob: expect.any(Blob),
      startAt: 2,
      duration: 3,
    });
    expect(store()).toMatchObject({
      isRecordingVoice: false,
      isPlaying: false,
    });
    expect(stopped).toHaveBeenCalled();
  });

  it('stops on its own at the end of the video', async () => {
    const onRecorded = vi.fn();
    renderWithProviders(<VoicePanel onRecorded={onRecorded} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    });
    act(() => vi.advanceTimersByTime(VOICE_COUNTDOWN_SEC * 1000));
    act(() => store().setPlayhead(10));
    expect(onRecorded).toHaveBeenCalledWith(
      expect.objectContaining({ startAt: 2, duration: 8 }),
    );
  });

  it('says so when the microphone is not allowed', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new Error('denied'),
    );
    renderWithProviders(<VoicePanel onRecorded={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    });
    expect(
      screen.getByText(/no permission to use the microphone/),
    ).toBeInTheDocument();
  });

  it('stops and lets go of the microphone when the panel closes', async () => {
    const onRecorded = vi.fn();
    const view = renderWithProviders(<VoicePanel onRecorded={onRecorded} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    });
    act(() => vi.advanceTimersByTime(VOICE_COUNTDOWN_SEC * 1000));
    view.unmount();
    expect(stopped).toHaveBeenCalled();
    expect(store().isRecordingVoice).toBe(false);
  });

  it('asks for clips first, and cannot record from the end', () => {
    useStudioStore.setState((s) => ({
      project: s.project ? { ...s.project, duration: 0 } : null,
    }));
    const first = renderWithProviders(<VoicePanel onRecorded={vi.fn()} />);
    expect(screen.getByText(/Add clips to record/)).toBeInTheDocument();
    first.unmount();
    useStudioStore.setState((s) => ({
      project: s.project ? { ...s.project, duration: 10 } : null,
      playhead: 10,
    }));
    renderWithProviders(<VoicePanel onRecorded={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
  });
});
