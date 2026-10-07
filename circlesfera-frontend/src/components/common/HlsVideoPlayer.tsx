import type Hls from 'hls.js';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { sanitizeUrl } from '../../utils/apiUtils';
import { logger } from '../../utils/logger';

interface HlsVideoPlayerProps
  extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  hlsUrl?: string; // Optional.m3u8 URL
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

      type HlsVideo = HTMLVideoElement & { __hls?: Hls | null };
      let hls: Hls | null = null;
      let cancelled = false;
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
        // The streaming library is large and only streams need it, so it is
        // downloaded the first time one is played instead of at startup.
        import('hls.js')
          .then(({ default: HlsLibrary }) => {
            if (cancelled) return;
            if (HlsLibrary.isSupported()) {
              const stream = new HlsLibrary({
                enableWorker: true,
                lowLatencyMode: true,
                autoStartLoad: !isNext,
              });
              hls = stream;
              (video as HlsVideo).__hls = stream;

              stream.loadSource(streamUrl);
              stream.attachMedia(video);

              stream.on(HlsLibrary.Events.ERROR, (_event, data) => {
                if (!data.fatal) return;

                switch (data.type) {
                  case HlsLibrary.ErrorTypes.NETWORK_ERROR:
                    logger.error('HLS network error, trying to recover', data);
                    stream.startLoad();
                    break;
                  case HlsLibrary.ErrorTypes.MEDIA_ERROR:
                    logger.error('HLS media error, trying to recover', data);
                    stream.recoverMediaError();
                    break;
                  default:
                    logger.error(
                      'HLS fatal error, falling back to direct source',
                      data,
                    );
                    stream.destroy();
                    hls = null;
                    (video as HlsVideo).__hls = null;
                    loadDirectSource();
                    break;
                }
              });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = streamUrl;
            } else {
              loadDirectSource();
            }
          })
          .catch((error: unknown) => {
            logger.error('Streaming library failed to load', error);
            if (!cancelled) loadDirectSource();
          });
      } else {
        loadDirectSource();
      }

      return () => {
        cancelled = true;
        hls?.destroy();
        (video as HlsVideo).__hls = null;
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
