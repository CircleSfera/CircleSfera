import { Loader2, Mic, Pause, Play, Send, Square, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/api';
import { logger } from '../../utils/logger';

interface VoiceRecorderProps {
  onSendVoice: (voiceData: {
    voiceUrl: string;
    voiceDuration: number;
    voiceWaveform: number[];
  }) => void;
  onCancel?: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSendVoice,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [liveWaveform, setLiveWaveform] = useState<number[]>([]);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const waveformPeaksRef = useRef<number[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      waveformPeaksRef.current = [];
      const recorder = new MediaRecorder(stream);

      // Web Audio API context setup for real waveform calculation
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioContextClass();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        audioCtxRef.current = ctx;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const captureVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          const normalized = Math.max(0.15, Math.min(1.0, average / 128));

          waveformPeaksRef.current.push(Number(normalized.toFixed(2)));

          // Keep a window of 16 recent samples for live visualizer
          setLiveWaveform((prev) => {
            const next = [...prev, normalized];
            return next.length > 16 ? next.slice(next.length - 16) : next;
          });

          animFrameRef.current = requestAnimationFrame(captureVolume);
        };

        captureVolume();
      } catch (_e) {
        // Fallback gracefully if Web Audio API analyser is unavailable
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);

        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }

        stream.getTracks().forEach((track) => {
          track.stop();
        });
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      logger.error('Failed to access microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    stopRecording();
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPreviewPlaying(false);
    setRecordedBlob(null);
    setRecordingSeconds(0);
    setLiveWaveform([]);
    if (onCancel) onCancel();
  };

  const togglePreview = () => {
    if (!recordedBlob) return;

    if (isPreviewPlaying) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setIsPreviewPlaying(false);
    } else {
      const url = URL.createObjectURL(recordedBlob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;

      audio.onended = () => {
        setIsPreviewPlaying(false);
      };

      audio
        .play()
        .then(() => setIsPreviewPlaying(true))
        .catch(() => setIsPreviewPlaying(false));
    }
  };

  const sendRecording = async () => {
    if (!recordedBlob && isRecording) {
      stopRecording();
      setTimeout(() => sendRecording(), 200);
      return;
    }

    if (!recordedBlob) return;

    try {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }

      setUploading(true);
      const formData = new FormData();
      formData.append('file', recordedBlob, 'voice-note.webm');

      const uploadRes = await apiClient.post<{ url: string }>(
        'uploads/file',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );

      // Downsample captured peaks into 20 normalized values for persistent waveform storage
      const captured = waveformPeaksRef.current;
      let finalWaveform: number[] = [];

      if (captured.length > 0) {
        const step = Math.max(1, Math.floor(captured.length / 20));
        for (let i = 0; i < 20; i++) {
          const idx = Math.min(captured.length - 1, i * step);
          finalWaveform.push(captured[idx] || 0.3);
        }
      } else {
        finalWaveform = Array.from({ length: 20 }, () =>
          Number((0.2 + Math.random() * 0.6).toFixed(2)),
        );
      }

      onSendVoice({
        voiceUrl: uploadRes.data.url,
        voiceDuration: Math.max(1, recordingSeconds),
        voiceWaveform: finalWaveform,
      });

      setRecordedBlob(null);
      setRecordingSeconds(0);
      setLiveWaveform([]);
      setIsPreviewPlaying(false);
    } catch (err) {
      logger.error('Failed to upload voice note:', err);
    } finally {
      setUploading(false);
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (uploading) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2 bg-white/5 border border-white/10 rounded-2xl text-xs text-accent-blue font-semibold">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Subiendo nota de voz...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 p-1.5 bg-black/40 border border-white/10 rounded-2xl">
      {!isRecording && !recordedBlob ? (
        <button
          type="button"
          onClick={startRecording}
          className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 active:scale-95 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all"
        >
          <Mic className="w-4 h-4" />
          <span>Grabar Voz</span>
        </button>
      ) : isRecording ? (
        <>
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-bold text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>{formatTimer(recordingSeconds)}</span>
          </div>

          {/* Live Frequency Visualizer */}
          <div className="flex items-center space-x-0.5 h-5 px-1">
            {(liveWaveform.length > 0
              ? liveWaveform
              : [0.2, 0.4, 0.6, 0.3, 0.7, 0.5, 0.3, 0.8]
            ).map((val, idx) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: live dynamic bars
                key={`live-bar-${idx}`}
                className="w-1 bg-red-400 rounded-full transition-all duration-75"
                style={{
                  height: `${Math.max(4, Math.min(20, Math.round(val * 20)))}px`,
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={stopRecording}
            className="p-2 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl transition-all"
            title="Detener grabación"
          >
            <Square className="w-4 h-4 fill-white" />
          </button>

          <button
            type="button"
            onClick={cancelRecording}
            className="p-2 bg-red-500/20 hover:bg-red-500/30 active:scale-95 text-red-400 rounded-xl transition-all"
            title="Cancelar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={togglePreview}
            className="p-2 bg-white/10 hover:bg-white/20 active:scale-95 text-accent-blue rounded-xl transition-all"
            title={isPreviewPlaying ? 'Pausar vista previa' : 'Escuchar borrador'}
          >
            {isPreviewPlaying ? (
              <Pause className="w-4 h-4 fill-accent-blue" />
            ) : (
              <Play className="w-4 h-4 fill-accent-blue ml-0.5" />
            )}
          </button>

          <div className="px-2.5 py-1.5 bg-accent-blue/10 border border-accent-blue/20 rounded-xl text-xs font-bold text-accent-blue">
            Listo ({formatTimer(recordingSeconds)})
          </div>

          <button
            type="button"
            onClick={sendRecording}
            className="p-2 bg-accent-blue text-white hover:bg-accent-blue/90 active:scale-95 rounded-xl transition-all shadow-md"
            title="Enviar nota de voz"
          >
            <Send className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={cancelRecording}
            className="p-2 bg-white/10 hover:bg-white/20 active:scale-95 text-gray-400 rounded-xl transition-all"
            title="Descartar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
};
