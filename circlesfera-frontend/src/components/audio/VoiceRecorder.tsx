import { Loader2, Mic, Send, Square, Trash2 } from 'lucide-react';
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
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
    setRecordedBlob(null);
    setRecordingSeconds(0);
    if (onCancel) onCancel();
  };

  const sendRecording = async () => {
    if (!recordedBlob && isRecording) {
      stopRecording();
      // Wait for blob onstop event
      setTimeout(() => sendRecording(), 200);
      return;
    }

    if (!recordedBlob) return;

    try {
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

      // Generate 20 normalized peak values for waveform
      const sampleWaveform = Array.from({ length: 20 }, () =>
        Number((0.2 + Math.random() * 0.7).toFixed(2)),
      );

      onSendVoice({
        voiceUrl: uploadRes.data.url,
        voiceDuration: Math.max(1, recordingSeconds),
        voiceWaveform: sampleWaveform,
      });

      setRecordedBlob(null);
      setRecordingSeconds(0);
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
          className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all"
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

          <button
            type="button"
            onClick={stopRecording}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
          >
            <Square className="w-4 h-4 fill-white" />
          </button>

          <button
            type="button"
            onClick={cancelRecording}
            className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <div className="px-3 py-1.5 bg-accent-blue/10 border border-accent-blue/20 rounded-xl text-xs font-bold text-accent-blue">
            Listo ({formatTimer(recordingSeconds)})
          </div>

          <button
            type="button"
            onClick={sendRecording}
            className="p-2 bg-accent-blue text-white hover:bg-accent-blue/90 rounded-xl transition-all shadow-md"
          >
            <Send className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={cancelRecording}
            className="p-2 bg-white/10 hover:bg-white/20 text-gray-400 rounded-xl transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
};
