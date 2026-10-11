import { Eye, Play, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AdminLiveStream } from '../../services/admin.service';
import { formatDateTime } from '../../utils/format';
import HlsVideoPlayer from '../common/HlsVideoPlayer';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui/Button';

interface Props {
  stream: AdminLiveStream;
  onEndStream: (id: string) => void;
}

// The record of a broadcast, shown in the pane beside the list like every
// other record: sections under a thin line, no boxes of their own.
export default function LiveStreamDetailPanel({ stream, onEndStream }: Props) {
  const { t, i18n } = useTranslation();
  const isLive = stream.status === 'LIVE';
  const videoUrl = isLive ? stream.hlsUrl : stream.replayUrl;
  const people = [
    { who: stream.host, role: t('admin.live.role_host') },
    ...(stream.coHost
      ? [{ who: stream.coHost, role: t('admin.live.role_cohost') }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-white break-words">
            {stream.title ||
              t('admin.live.untitled', {
                user: stream.host?.profile?.username || '—',
              })}
          </h3>
          <p className="text-sm text-white/50">
            {formatDateTime(stream.startedAt, i18n.language)}
          </p>
        </div>
        {isLive ? (
          <span className="shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {t('admin.live.badge_live')}
          </span>
        ) : (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-xs font-bold tracking-wider">
            {t('admin.live.badge_ended')}
          </span>
        )}
      </div>

      <div className="rounded-xl overflow-hidden bg-black aspect-video relative">
        {videoUrl ? (
          <HlsVideoPlayer
            src={videoUrl}
            autoPlay
            controls
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 text-sm">
            <Play className="w-10 h-10 mb-2 opacity-20" />
            <p>{t('admin.lives.no_video_source')}</p>
          </div>
        )}
        {isLive && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 text-white text-sm font-semibold">
            <Eye className="w-4 h-4 text-red-400" />
            {stream.viewerCount}
          </div>
        )}
      </div>

      <dl className="text-sm border-t border-white/5">
        <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/5">
          <dt className="text-xs font-medium text-white/40">
            {t('admin.live.viewers')}
          </dt>
          <dd className="text-white font-semibold tabular-nums">
            {stream.viewerCount}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/5">
          <dt className="text-xs font-medium text-white/40">
            {t('admin.live.gifts')}
          </dt>
          <dd className="text-white font-semibold tabular-nums">
            {stream._count?.gifts || 0}
          </dd>
        </div>
      </dl>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-1">
          {t('admin.live.participants')}
        </h4>
        <ul className="divide-y divide-white/5">
          {people.map(({ who, role }) => (
            <li key={role} className="flex items-center gap-3 py-2.5">
              <UserAvatar
                src={who?.profile?.avatar || undefined}
                alt={who?.profile?.username || '?'}
                size="sm"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  @{who?.profile?.username}
                </p>
                <p className="text-xs text-white/50">{role}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isLive && (
        <div className="pt-4 border-t border-white/5 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-white/40">
            {t('admin.live.moderation_actions')}
          </h4>
          <p className="text-xs text-white/50">
            {t('admin.live.force_end_description')}
          </p>
          <Button
            variant="danger"
            className="min-h-11"
            onClick={() => onEndStream(stream.id)}
          >
            <Square size={16} className="mr-2 shrink-0" />
            {t('admin.live.force_end_title')}
          </Button>
        </div>
      )}
    </div>
  );
}
