import Hls from 'hls.js';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { sanitizeUrl } from '../../utils/apiUtils';
import { logger } from '../../utils/logger';

interface HlsVideoPlayerProps
  extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  hlsUrl?: string; // Optional .m3u8 URL
  isNext?: boolean; // If true, only prefetch metadata
}

function resolveMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return sanitizeUrl(url) || url;
}

const HlsVideoPlayer = forwardRef<HTMLVideoElement, HlsVideoPlayerProps>(
  ({ src, hlsUrl, isNext, ...props }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      let hls: Hls | null = null;
      const directSrc = resolveMediaUrl(src) || src;
      const streamUrl = hlsUrl?.endsWith('.m3u8')
        ? resolveMediaUrl(hlsUrl) || hlsUrl
        : undefined;

      const loadDirectSource = () => {
        if (video.src !== directSrc) {
          video.src = directSrc;
          video.load();
        }
      };

      if (streamUrl) {
        if (Hls.isSupported()) {
          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            autoStartLoad: !isNext,
          });

          hls.loadSource(streamUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;

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
                logger.error(
                  'HLS fatal error, falling back to direct source',
                  data,
                );
                hls?.destroy();
                hls = null;
                loadDirectSource();
                break;
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl;
        } else {
          loadDirectSource();
        }
      } else {
        loadDirectSource();
      }

      (video as HTMLVideoElement & { __hls?: Hls | null }).__hls = hls;

      return () => {
        hls?.destroy();
        (video as HTMLVideoElement & { __hls?: Hls | null }).__hls = null;
      };
    }, [src, hlsUrl, isNext]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      const hls = (video as HTMLVideoElement & { __hls?: Hls }).__hls;

      if (hls && !isNext) {
        hls.startLoad();
      }
    }, [isNext]);

    return <video ref={videoRef} {...props} />;
  },
);

HlsVideoPlayer.displayName = 'HlsVideoPlayer';

export default HlsVideoPlayer;
