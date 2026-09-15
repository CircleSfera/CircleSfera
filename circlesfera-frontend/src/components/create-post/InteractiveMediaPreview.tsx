import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaFile } from '../../hooks/useCreatePost';
import Carousel from '../Carousel';

interface InteractiveMediaPreviewProps {
  mediaFiles: MediaFile[];
  mode: 'POST' | 'FRAME' | 'STORY';
  className?: string;
}

export default function InteractiveMediaPreview({
  mediaFiles,
  mode,
  className = '',
}: InteractiveMediaPreviewProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const hasVideo = mediaFiles.some((m) => m.type === 'video');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Number.parseFloat(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds: number) => {
    if (Number.isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Post = vertical 4:5. Frame/Story = 9:16. Compact for caption density.
  const aspectClass =
    mode === 'FRAME' || mode === 'STORY'
      ? 'w-[96px] h-[170px] aspect-9/16'
      : 'w-[120px] h-[150px] aspect-4/5';

  return (
    <div
      className={`relative bg-black rounded-xl border border-white/10 overflow-hidden shadow-xl shrink-0 group ${aspectClass} ${className}`}
    >
      {hasVideo && mediaFiles.length === 1 ? (
        <div className="relative w-full h-full">
          <video
            ref={videoRef}
            src={mediaFiles[0].url}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            className="w-full h-full object-cover cursor-pointer"
            onClick={togglePlay}
          />

          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/50 to-transparent px-1.5 pt-2 pb-1.5 flex flex-col gap-1 z-20">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="min-w-7 min-h-7 flex items-center justify-center hover:bg-white/20 active:scale-90 rounded-full transition-all text-white outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  aria-label={
                    isPlaying
                      ? t('createPost.preview.pause')
                      : t('createPost.preview.play')
                  }
                >
                  {isPlaying ? (
                    <Pause size={12} fill="currentColor" />
                  ) : (
                    <Play size={12} fill="currentColor" />
                  )}
                </button>
                <span className="font-mono text-[8px] text-white/70 tabular-nums shrink-0">
                  {formatTime(currentTime)}
                </span>
              </div>

              <button
                type="button"
                onClick={toggleMute}
                className="min-w-7 min-h-7 flex items-center justify-center hover:bg-white/20 active:scale-90 rounded-full transition-all text-white outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                aria-label={isMuted ? t('common.unmute') : t('common.mute')}
              >
                {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
              </button>
            </div>

            <div className="relative w-full h-1 bg-white/25 rounded-full overflow-hidden cursor-pointer group/timeline">
              <div
                className="h-full bg-linear-to-r from-brand-primary to-brand-blue rounded-full transition-all duration-75"
                style={{
                  width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                }}
              />
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.05}
                value={currentTime}
                onChange={handleSeek}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                title={t('createPost.preview.seek')}
              />
            </div>
          </div>
        </div>
      ) : (
        <Carousel
          media={mediaFiles.map((m) => ({
            id: m.url,
            url: m.url,
            type: m.type,
            filter: m.filter,
          }))}
          aspectRatio={mode === 'POST' ? 'aspect-4/5' : 'aspect-9/16'}
          objectFit="cover"
        />
      )}
    </div>
  );
}
