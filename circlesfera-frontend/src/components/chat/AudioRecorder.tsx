import { Send, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '../../utils/logger';

interface AudioRecorderProps {
  onSend: (audioBlob: Blob) => void;
  onCancel: () => void;
}

export default function AudioRecorder({
  onSend,
  onCancel,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopRecordingCleanup = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      logger.error('Error accessing microphone:', err);
      onCancel();
    }
  }, [onCancel]);

  useEffect(() => {
    const timer = setTimeout(() => {
      startRecording();
    }, 0);
    return () => {
      clearTimeout(timer);
      stopRecordingCleanup();
    };
  }, [startRecording, stopRecordingCleanup]);

  const handleStop = () => {
    stopRecordingCleanup();
    setIsRecording(false);
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate stable visualizer bars
  const visualizerBars = useMemo(() => {
    return [...Array(10)].map((_, i) => ({
      height: `${20 + ((i * 10) % 80)}%`, // Deterministic pattern
      delay: `${i * 0.1}s`,
    }));
  }, []);

  return (
    <div className="flex items-center gap-4 bg-[#262626] p-2 rounded-[26px] w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex-1 flex items-center gap-3 px-4">
        {isRecording ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white font-mono">{formatTime(duration)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-white">
            <div className="w-full h-8 bg-white/10 rounded-full px-4 flex items-center">
              Recorded Audio
            </div>
          </div>
        )}

        {/* Visualizer placeholder */}
        {isRecording && (
          <div className="flex items-center gap-1 h-8 flex-1 justify-center opacity-50">
            {['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10'].map(
              (id, i) => (
                <div
                  key={id}
                  className="w-1 bg-white rounded-full animate-pulse"
                  style={{
                    height: visualizerBars[i].height,
                    animationDelay: visualizerBars[i].delay,
                  }}
                />
              ),
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-white/10 rounded-full transition-colors"
        >
          <Trash2 size={20} />
        </button>

        {isRecording ? (
          <button
            type="button"
            onClick={handleStop}
            className="p-2 text-red-500 hover:text-red-400 hover:bg-white/10 rounded-full transition-colors"
          >
            <Square size={20} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            className="p-2 text-[#3797f0] hover:text-blue-400 hover:bg-white/10 rounded-full transition-colors"
          >
            <Send size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
