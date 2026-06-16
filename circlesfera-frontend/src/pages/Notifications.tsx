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
import { LoadingSpinner } from '../components/LoadingStates';
import UserAvatar from '../components/UserAvatar';
import { notificationsApi } from '../services';
import { useNotificationsStore } from '../stores/notificationsStore';
import type { Notification } from '../types';

export default function Notifications() {
  const { t } = useTranslation();
  const {
    data: notifications,
    isLoading,
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
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
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
        return <Heart size={14} className="fill-current" />;
      case 'FOLLOW':
      case 'FOLLOW_REQUEST':
      case 'FOLLOW_ACCEPTED':
        return <UserPlus size={14} />;
      case 'COMMENT':
        return <MessageCircle size={14} />;
      case 'MENTION':
        return <AtSign size={14} />;
      case 'MODERATION':
        return <Shield size={14} />;
      case 'PROMOTION_SUCCESS':
      case 'PROMOTION_REJECTED':
        return <Rocket size={14} />;
      default:
        return <Bell size={14} />;
    }
  };

  const getIconBg = (type: string) => {
    switch (type) {
      case 'LIKE':
      case 'COMMENT_LIKE':
        return 'bg-red-500';
      case 'FOLLOW':
      case 'FOLLOW_ACCEPTED':
        return 'bg-blue-500';
      case 'COMMENT':
        return 'bg-purple-500';
      case 'MENTION':
        return 'bg-yellow-500 text-black';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="pb-20 min-h-screen md:max-w-2xl md:mx-auto">
      <SEO title={t('notifications.seo_title')} />
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <h1 className="text-xl font-bold tracking-tight text-white">
          {t('notifications.title', 'Actividad')}
        </h1>
      </div>

      <div className="flex flex-col">
        {notifs.length === 0 ? (
          <div className="text-center py-32 opacity-50 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
              <Bell size={32} className="text-white/20" />
            </div>
            <p className="text-lg font-medium">
              {t('notifications.no_activity')}
            </p>
          </div>
        ) : (
          notifs.map((notif) => (
            <div
              key={notif.id}
              className={`group relative flex items-center gap-4 transition-colors p-4 md:px-0 ${!notif.read ? 'bg-white/5' : 'hover:bg-white/5'}`}
            >
              {/* Visual Unread Indicator */}
              {!notif.read && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary" />
              )}

              {/* Avatar with Type Icon Badge */}
              <div className="relative shrink-0">
                <Link
                  to={`/${notif.sender?.profile.username}`}
                  className="block transition-transform active:scale-95"
                >
                  <UserAvatar
                    src={notif.sender?.profile.avatar}
                    thumbnailUrl={notif.sender?.profile.thumbnailUrl}
                    standardUrl={notif.sender?.profile.standardUrl}
                    alt={
                      notif.sender?.profile.username ||
                      t('notifications.unknown_user')
                    }
                    size="md"
                  />
                  <div
                    className={`absolute -right-1 -bottom-1 w-5 h-5 rounded-full border-2 border-[#0A0A0A] flex items-center justify-center text-white ${getIconBg(notif.type)}`}
                  >
                    {getIcon(notif.type)}
                  </div>
                </Link>
              </div>

              <div className="flex-1">
                <p className="text-[15px] leading-snug">
                  <Link
                    to={`/${notif.sender?.profile.username}`}
                    className="font-bold text-white hover:text-brand-primary/90 transition-colors"
                  >
                    {notif.sender?.profile.username ||
                      t('notifications.unknown_user')}
                  </Link>
                  <span className="text-white/80 ml-1.5">
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
                <p className="text-xs text-white/40 mt-1.5 font-medium flex items-center gap-2">
                  {new Date(notif.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>

              {notif.postId && (
                <Link
                  to={`/p/${notif.postId}`}
                  className="shrink-0 group-hover:scale-105 transition-transform"
                >
                  <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center overflow-hidden border border-white/5">
                    <Star size={18} className="text-white/30" />
                  </div>
                </Link>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
