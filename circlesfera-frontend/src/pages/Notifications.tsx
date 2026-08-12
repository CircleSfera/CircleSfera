import { useQuery } from '@tanstack/react-query';
import {
  AtSign,
  Bell,
  Heart,
  MessageCircle,
  Rocket,
  Shield,
  Star,
  UserPlus,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import SEO from '../components/common/SEO';
import { EmptyState, ErrorState } from '../components/ErrorEmptyStates';
import { LoadingSpinner } from '../components/LoadingStates';
import PendingFollowRequests from '../components/notifications/PendingFollowRequests';
import UserAvatar from '../components/UserAvatar';
import { notificationsApi } from '../services';
import { useNotificationsStore } from '../stores/notificationsStore';
import type { Notification } from '../types';

export default function Notifications() {
  const { t } = useTranslation();
  const {
    data: notifications,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll(),
  });

  const liveNotifications = useNotificationsStore(
    (state) => state.liveNotifications,
  );
  const clearUnread = useNotificationsStore((state) => state.clearUnread);

  // Mark all as read when opening the page
  useEffect(() => {
    notificationsApi.markAllAsRead();
    clearUnread();

    // Also refetch to ensure server state is fresh
    refetch();
  }, [clearUnread, refetch]);

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <ErrorState
          title={t('notifications.error_title', "Couldn't load notifications")}
          message={t(
            'notifications.error_message',
            'Something went wrong. Please try again.',
          )}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  // Merge API data and live notifications
  const apiNotifs: Notification[] = notifications?.data?.data || [];

  // Create a map to deduplicate by content fingerprint (type + sender + post)
  // We want to group certain notifications (like Follow/Like) to avoid duplicates
  const notifMap = new Map<string, Notification>();
  const fingerprints = new Set<string>();

  [...liveNotifications, ...apiNotifs].forEach((n) => {
    // First check ID (standard dedupe)
    if (notifMap.has(n.id)) return;

    // Grouping rules:
    // For LIKE and FOLLOW, we only ever want to see one (the latest)
    // For COMMENT and MENTION, we might want to see each interaction if they are different
    let fingerprint = n.id; // Default: no grouping, use unique ID

    if (
      [
        'LIKE',
        'COMMENT_LIKE',
        'FOLLOW',
        'FOLLOW_REQUEST',
        'FOLLOW_ACCEPTED',
      ].includes(n.type)
    ) {
      fingerprint = `${n.type}-${n.senderId}-${n.postId || 'none'}`;
    } else if (n.type === 'COMMENT' || n.type === 'MENTION') {
      // Group comments/mentions only if they are identical (content + post + sender)
      fingerprint = `${n.type}-${n.senderId}-${n.postId || 'none'}-${n.content}`;
    }

    if (!fingerprints.has(fingerprint)) {
      notifMap.set(n.id, n);
      fingerprints.add(fingerprint);
    }
  });

  const notifs = Array.from(notifMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const getIcon = (type: string) => {
    switch (type) {
      case 'LIKE':
      case 'COMMENT_LIKE':
        return <Heart size={13} className="fill-current" />;
      case 'FOLLOW':
      case 'FOLLOW_REQUEST':
      case 'FOLLOW_ACCEPTED':
        return <UserPlus size={13} />;
      case 'COMMENT':
        return <MessageCircle size={13} />;
      case 'MENTION':
        return <AtSign size={13} />;
      case 'MODERATION':
        return <Shield size={13} />;
      case 'PROMOTION_SUCCESS':
      case 'PROMOTION_REJECTED':
        return <Rocket size={13} />;
      default:
        return <Bell size={13} />;
    }
  };

  // Returns inline style for icon badge background (gradient per type)
  const getIconStyle = (type: string): React.CSSProperties => {
    switch (type) {
      case 'LIKE':
      case 'COMMENT_LIKE':
        return {
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          boxShadow: '0 2px 8px rgba(239,68,68,0.5)',
        };
      case 'FOLLOW':
      case 'FOLLOW_ACCEPTED':
        return {
          background: 'linear-gradient(135deg, #405de6, #3b82f6)',
          boxShadow: '0 2px 8px rgba(64,93,230,0.5)',
        };
      case 'FOLLOW_REQUEST':
        return {
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          boxShadow: '0 2px 8px rgba(99,102,241,0.5)',
        };
      case 'COMMENT':
        return {
          background: 'linear-gradient(135deg, #8c52ff, #a855f7)',
          boxShadow: '0 2px 8px rgba(140,82,255,0.5)',
        };
      case 'MENTION':
        return {
          background: 'linear-gradient(135deg, #ff5757, #f59e0b)',
          color: 'black',
          boxShadow: '0 2px 8px rgba(255,87,87,0.5)',
        };
      case 'PROMOTION_SUCCESS':
        return {
          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
          boxShadow: '0 2px 8px rgba(34,197,94,0.4)',
        };
      case 'PROMOTION_REJECTED':
        return {
          background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
          boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
        };
      case 'MODERATION':
        return {
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          boxShadow: '0 2px 8px rgba(249,115,22,0.4)',
        };
      default:
        return { background: 'linear-gradient(135deg, #6b7280, #4b5563)' };
    }
  };

  // Relative timestamp (e.g. "2h", "3d")
  const getRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <div className="pb-24 min-h-dvh md:max-w-2xl md:mx-auto">
      <SEO title={t('notifications.seo_title')} />

      {/* Page Header */}
      <div className="px-4 pt-3 pb-2 md:pt-6 md:pb-3">
        <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
          {t('notifications.title', 'Actividad')}
        </h1>
      </div>

      <div className="flex flex-col px-2 pt-1">
        <PendingFollowRequests />
        {notifs.length === 0 ? (
          <div className="mt-10 px-4">
            <EmptyState
              icon="notifications"
              title={t('notifications.no_activity')}
            />
          </div>
        ) : (
          notifs.map((notif) => (
            <article
              key={notif.id}
              className="group relative flex items-center gap-2.5 transition-all duration-200 min-h-[72px] py-3 px-3 rounded-xl"
              style={
                !notif.read
                  ? {
                      background:
                        'linear-gradient(135deg, rgba(140,82,255,0.08) 0%, rgba(255,87,87,0.05) 100%)',
                      border: '1px solid rgba(140,82,255,0.15)',
                    }
                  : {
                      border: '1px solid transparent',
                    }
              }
            >
              {/* Unread brand indicator */}
              {!notif.read && (
                <div
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full"
                  style={{
                    background: 'linear-gradient(180deg, #ff5757, #8c52ff)',
                    boxShadow: '0 0 6px rgba(140,82,255,0.6)',
                  }}
                />
              )}

              {/* Avatar with gradient icon badge */}
              <div className="relative shrink-0 ml-2">
                <Link
                  to={`/${notif.sender?.profile?.username}`}
                  className="block transition-transform active:scale-95"
                >
                  <UserAvatar
                    src={notif.sender?.profile?.avatar}
                    thumbnailUrl={notif.sender?.profile?.thumbnailUrl}
                    standardUrl={notif.sender?.profile?.standardUrl}
                    alt={
                      notif.sender?.profile?.username ||
                      t('notifications.unknown_user')
                    }
                    size="compact"
                  />
                  <div
                    className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full border-2 border-black flex items-center justify-center text-white"
                    style={getIconStyle(notif.type)}
                  >
                    {getIcon(notif.type)}
                  </div>
                </Link>
              </div>

              {/* Text content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">
                  <Link
                    to={`/${notif.sender?.profile?.username}`}
                    className="font-bold text-white hover:opacity-80 transition-opacity"
                  >
                    {notif.sender?.profile?.username ||
                      t('notifications.unknown_user')}
                  </Link>
                  <span className="text-white/70 ml-1">
                    {notif.type === 'LIKE' && t('notifications.types.like')}
                    {notif.type === 'COMMENT_LIKE' &&
                      t('notifications.types.comment_like')}
                    {notif.type === 'FOLLOW' && t('notifications.types.follow')}
                    {notif.type === 'COMMENT' &&
                      t('notifications.types.comment')}
                    {notif.type === 'MENTION' &&
                      t('notifications.types.mention')}
                    {notif.type === 'FOLLOW_REQUEST' &&
                      t('notifications.types.follow_request')}
                    {notif.type === 'FOLLOW_ACCEPTED' &&
                      t('notifications.types.follow_accepted')}
                    {notif.type === 'MODERATION' &&
                      t('notifications.types.moderation', {
                        content: notif.content,
                      })}
                    {notif.type === 'PROMOTION_SUCCESS' &&
                      t('notifications.types.promotion_success', {
                        content: notif.content,
                      })}
                    {notif.type === 'PROMOTION_REJECTED' &&
                      t('notifications.types.promotion_rejected', {
                        content: notif.content,
                      })}
                  </span>
                </p>
                <p
                  className="text-[11px] font-semibold mt-1"
                  style={{ color: 'rgba(255,255,255,0.28)' }}
                >
                  {getRelativeTime(String(notif.createdAt))}
                </p>
              </div>

              {/* Post thumbnail */}
              {notif.postId && (
                <Link
                  to={`/p/${notif.postId}`}
                  className="shrink-0 opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-200"
                >
                  <div
                    className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(140, 82, 255,0.15), rgba(64,93,230,0.1))',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Star
                      size={16}
                      style={{ color: 'rgba(255,255,255,0.25)' }}
                    />
                  </div>
                </Link>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
