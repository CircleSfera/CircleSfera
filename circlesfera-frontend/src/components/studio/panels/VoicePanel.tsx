import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '../../../stores/studioStore';
import { formatTimecode } from '../editor/EditorTransport';

/** Seconds counted down before a recording starts. */
export const VOICE_COUNTDOWN_SEC = 3;

// The formats a recording is asked for, in order: Chrome, Firefox and
// Android record webm, Safari mp4.
const RECORDED_TYPES = ['audio/webm', 'audio/mp4'] as const;

function recordedType(): string | undefined {
  return RECORDED_TYPES.find(
    (type) =>
      typeof MediaRecorder !== 'undefined' &&
      typeof MediaRecorder.isTypeSupported === 'function' &&
      MediaRecorder.isTypeSupported(type),
  );
}

export interface VoiceRecording {
  blob: Blob;
  /** Where on the timeline it starts, in seconds. */
  startAt: number;
  /** How long it lasts, in seconds. */
  duration: number;
}

interface VoicePanelProps {
  onRecorded: (recording: VoiceRecording) => void;
}

type Phase = 'idle' | 'counting' | 'recording' | 'denied';

/**
 * A voice over the video: after a count of three, the video plays silent
 * from the playhead while the microphone records, until it is stopped or
 * the video ends.
 */
export default function VoicePanel({ onRecorded }: VoicePanelProps) {
  const { t } = useTranslation();
  const playhead = useStudioStore((s) => s.playhead);
  const duration = useStudioStore((s) => s.project?.duration ?? 0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(VOICE_COUNTDOWN_SEC);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startAt = useRef(0);
  const timer = useRef<number | null>(null);

  const release = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    useStudioStore.getState().setRecordingVoice(false);
    useStudioStore.getState().setPlaying(false);
  };

  // Leaving the panel stops a recording and lets go of the microphone.
  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      if (timer.current !== null) window.clearInterval(timer.current);
      for (const track of stream.current?.getTracks() ?? []) track.stop();
      useStudioStore.getState().setRecordingVoice(false);
    },
    [],
  );

  const stop = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  // The recording ends on its own at the end of the video.
  const atEnd = playhead >= duration - 0.05;
  useEffect(() => {
    if (
      phase === 'recording' &&
      atEnd &&
      recorder.current?.state === 'recording'
    ) {
      recorder.current.stop();
    }
  }, [phase, atEnd]);

  const start = async () => {
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase('denied');
      return;
    }
    stream.current = mic;
    setPhase('counting');
    setCount(VOICE_COUNTDOWN_SEC);
    let left = VOICE_COUNTDOWN_SEC;
    timer.current = window.setInterval(() => {
      left -= 1;
      setCount(left);
      if (left > 0) return;
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;
      const type = recordedType();
      const rec = new MediaRecorder(mic, type ? { mimeType: type } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const store = useStudioStore.getState();
        const length = Math.min(
          store.playhead - startAt.current,
          duration - startAt.current,
        );
        release();
        setPhase('idle');
        if (length > 0 && chunks.length > 0) {
          onRecorded({
            blob: new Blob(chunks, { type: rec.mimeType || type }),
            startAt: startAt.current,
            duration: length,
          });
        }
      };
      recorder.current = rec;
      const store = useStudioStore.getState();
      startAt.current = store.playhead;
      store.setRecordingVoice(true);
      rec.start();
      store.setPlaying(true);
      setPhase('recording');
    }, 1000);
  };

  if (duration === 0) {
    return (
      <p className="text-sm text-white/60">{t('studio.voice.needs_clips')}</p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-white/60">
        {phase === 'denied'
          ? t('studio.voice.denied')
          : phase === 'counting'
            ? t('studio.voice.starting', { count })
            : phase === 'recording'
              ? t('studio.voice.recording', {
                  time: formatTimecode(playhead - startAt.current),
                })
              : t('studio.voice.hint', { time: formatTimecode(playhead) })}
      </p>
      {phase === 'recording' ? (
        <button
          type="button"
          onClick={stop}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-secondary px-4 text-sm font-bold text-white"
        >
          <Square size={16} aria-hidden />
          {t('studio.voice.stop')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={phase === 'counting' || playhead >= duration - 0.05}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-black disabled:opacity-50"
        >
          <Mic size={16} aria-hidden />
          {t('studio.voice.record')}
        </button>
      )}
    </div>
  );
}
