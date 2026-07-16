import Hls from 'hls.js';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { logger } from '../../utils/logger';

interface HlsVideoPlayerProps
  extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  hlsUrl?: string; // Optional .m3u8 URL
  isNext?: boolean; // If true, only prefetch metadata
}

const HlsVideoPlayer = forwardRef<HTMLVideoElement, HlsVideoPlayerProps>(
  ({ src, hlsUrl, isNext, ...props }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const initialIsNextRef = useRef(isNext);

    // Forward the ref to parent components (like FrameItem)
    useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      let hls: Hls | null = null;
      const targetUrl = hlsUrl || src;

      // Check if it's an HLS stream (m3u8)
      if (targetUrl.includes('.m3u8')) {
        if (Hls.isSupported()) {
          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            autoStartLoad: !initialIsNextRef.current, // If it's the next video, don't download all segments yet
          });

          hls.loadSource(targetUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  logger.error('HLS network error, trying to recover', data);
                  hls?.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  logger.error('HLS media error, trying to recover', data);
                  hls?.recoverMediaError();
                  break;
                default:
                  logger.error('HLS fatal error, destroying', data);
                  hls?.destroy();
                  break;
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Native support (Safari)
          video.src = targetUrl;
        } else {
          // Fallback to raw mp4 if HLS is not supported at all
          video.src = src;
        }
      } else {
        // Direct MP4
        video.src = src;
      }

      // Store hls instance on the video element for the other effect to access
      (video as any).__hls = hls;

      return () => {
        if (hls) {
          hls.destroy();
        }
      };
    }, [src, hlsUrl]);

    // Start loading when it's no longer 'next' but 'active'
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      const hls = (video as any).__hls as Hls | undefined;
      
      if (hls && !isNext) {
        hls.startLoad();
      }
    }, [isNext]);

    return <video ref={videoRef} {...props} />;
  },
);

HlsVideoPlayer.displayName = 'HlsVideoPlayer';

export default HlsVideoPlayer;
