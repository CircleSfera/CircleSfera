import { useQuery } from '@tanstack/react-query';
import {
  AtSign,
  Bell,
  ChevronRight,
  Coins,
  Heart,
  MessageCircle,
  Rocket,
  Shield,
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

// Moderation notices about a warning or strike carry a target type; the
// message is shown in the reader's language instead of the stored text.
const STRIKE_NOTICE_KEYS: Record<string, string> = {
  profile_warning: 'notifications.types.moderation_warning',
  profile_strike: 'notifications.types.moderation_strike',
  profile_suspension: 'notifications.types.moderation_suspension',
  profile_ban: 'notifications.types.moderation_ban',
  profile_restriction: 'notifications.types.moderation_restriction',
  profile_restriction_review:
    'notifications.types.moderation_restriction_review',
};

/** The page of the support request a notice is about, when it is about one. */
function supportRequestPath(notif: {
  targetType?: string | null;
  targetId?: string | null;
}): string | null {
  return notif.targetType === 'support_ticket' && notif.targetId
    ? `/support/requests/${encodeURIComponent(notif.targetId)}`
    : null;
}

export default function Notifications() {
  const { t, i18n } = useTranslation();
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
          title={t('notifications.error_title')}
          message={t('notifications.error_message')}
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
      case 'PAYMENT':
        return <Coins size={13} />;
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
          background: 'var(--brand-secondary)',
        };
      case 'FOLLOW':
      case 'FOLLOW_ACCEPTED':
        return {
          background: 'var(--brand-blue)',
        };
      case 'FOLLOW_REQUEST':
        return {
          background: 'var(--brand-blue)',
        };
      case 'COMMENT':
        return {
          background: 'var(--brand-primary)',
        };
      case 'MENTION':
        return {
          background: 'var(--brand-primary)',
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
      case 'PAYMENT':
        return {
          background:
            'linear-gradient(135deg, var(--brand-secondary), var(--brand-primary))',
          boxShadow: '0 2px 8px rgba(var(--brand-primary-rgb), 0.45)',
        };
      default:
        return { background: 'linear-gradient(135deg, #6b7280, #4b5563)' };
    }
  };

  // Relative timestamp (e.g. "2h", "3d")
  const getRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('notifications.just_now');
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
    });
  };

  const moderationAppealPath = (notif: Notification) => {
    // Warning and strike notices open the profile standing, which shows the
    // details and an appeal action for each record.
    // A protective restriction is appealed directly, as its own decision.
    if (
      (notif.targetType === 'profile_restriction' ||
        notif.targetType === 'profile_restriction_review') &&
      notif.targetId
    ) {
      return `/accounts/appeals?targetType=RESTRICTION&targetId=${encodeURIComponent(notif.targetId)}`;
    }
    if (notif.targetType && STRIKE_NOTICE_KEYS[notif.targetType]) {
      return '/accounts/appeals';
    }
    if (notif.targetType === 'account_bot_label') {
      return '/accounts/appeals?targetType=BOT_LABEL';
    }
    const content = (notif.content || '').toLowerCase();
    if (notif.postId) {
      return `/accounts/appeals?targetType=POST_REMOVAL&targetId=${encodeURIComponent(notif.postId)}`;
    }
    if (
      content.includes('bot') ||
      content.includes('automated') ||
      content.includes('automatiz')
    ) {
      return '/accounts/appeals?targetType=BOT_LABEL';
    }
    return '/accounts/appeals?targetType=ACCOUNT_BAN';
  };

  return (
    <div className="pb-24 min-h-dvh md:max-w-2xl md:mx-auto">
      <SEO title={t('notifications.seo_title')} />

      {/* Page Header */}
      <div className="px-4 pt-3 pb-2 md:pt-6 md:pb-3">
        <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
          {t('notifications.title')}
        </h1>
      </div>

      <div className="flex flex-col gap-2 px-2 pt-1">
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
              className="group relative flex items-center gap-2.5 transition-all duration-200 min-h-18 py-3 px-3 rounded-xl"
              style={
                !notif.read
                  ? {
                      background:
                        'linear-gradient(135deg, rgba(136,76,255,0.08) 0%, rgba(255,87,87,0.05) 100%)',
                      border: '1px solid rgba(136,76,255,0.15)',
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
                    background: 'linear-gradient(180deg, #ff5757, #884cff)',
                    boxShadow: '0 0 6px rgba(136,76,255,0.6)',
                  }}
                />
              )}

              {/* Avatar with gradient icon badge */}
              <div className="relative shrink-0 ml-2">
                <Link
                  to={supportRequestPath(notif) ?? `/${notif.sender?.username}`}
                  className="block p-0.5 transition-transform active:scale-95"
                  aria-label={
                    supportRequestPath(notif)
                      ? t('notifications.view_request')
                      : t('common.view_profile', {
                          username:
                            notif.sender?.username ||
                            t('notifications.unknown_user'),
                        })
                  }
                >
                  <UserAvatar
                    src={notif.sender?.avatar || ''}
                    thumbnailUrl={notif.sender?.thumbnailUrl}
                    standardUrl={notif.sender?.standardUrl}
                    alt={
                      notif.sender?.username || t('notifications.unknown_user')
                    }
                    size="md"
                  />
                  <div
                    className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full border-2 border-black flex items-center justify-center text-white"
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
                    to={
                      supportRequestPath(notif) ?? `/${notif.sender?.username}`
                    }
                    className="font-bold text-white hover:opacity-80 transition-opacity"
                  >
                    {supportRequestPath(notif)
                      ? t('notifications.from_support')
                      : notif.sender?.username ||
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
                      (notif.targetType && STRIKE_NOTICE_KEYS[notif.targetType]
                        ? t(STRIKE_NOTICE_KEYS[notif.targetType])
                        : t('notifications.types.moderation', {
                            content: notif.content,
                          }))}
                    {notif.type === 'PROMOTION_SUCCESS' &&
                      t('notifications.types.promotion_success', {
                        content: notif.content,
                      })}
                    {notif.type === 'PROMOTION_REJECTED' &&
                      t('notifications.types.promotion_rejected', {
                        content: notif.content,
                      })}
                    {/* Written by the server in the reader's language. */}
                    {(notif.type === 'PAYMENT' || notif.type === 'SYSTEM') &&
                      notif.content}
                  </span>
                </p>
                {notif.type === 'MODERATION' && (
                  <Link
                    to={moderationAppealPath(notif)}
                    className="inline-flex mt-2 min-h-11 items-center rounded-full border border-orange-400/30 bg-orange-500/10 px-3 text-xs font-semibold text-orange-200 hover:bg-orange-500/20 transition-colors"
                  >
                    {notif.targetType && STRIKE_NOTICE_KEYS[notif.targetType]
                      ? t('notifications.strike_details_cta')
                      : t('notifications.appeal_cta')}
                  </Link>
                )}
                <p className="text-xs font-medium mt-1 text-white/45">
                  {getRelativeTime(String(notif.createdAt))}
                </p>
              </div>

              {/* The way to the support request */}
              {supportRequestPath(notif) && (
                <Link
                  to={supportRequestPath(notif) as string}
                  aria-label={t('notifications.view_request')}
                  className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-white/5 border border-white/8 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              )}
              {/* The way to the post */}
              {notif.postId && notif.type !== 'MODERATION' && (
                <Link
                  to={`/p/${notif.postId}`}
                  aria-label={t('notifications.view_post')}
                  className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-white/5 border border-white/8 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              )}
              {notif.type === 'MODERATION' && notif.postId && (
                <Link
                  to={moderationAppealPath(notif)}
                  className="shrink-0 opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-200"
                  aria-label={t('notifications.appeal_cta')}
                >
                  <div
                    className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(234,88,12,0.15))',
                      border: '1px solid rgba(249,115,22,0.25)',
                    }}
                  >
                    <Shield
                      size={16}
                      style={{ color: 'rgba(253,186,116,0.9)' }}
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
