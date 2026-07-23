import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  Copy,
  Database,
  ExternalLink,
  Fingerprint,
  Mail,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AdminUserDetail } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { UserAvatar } from '../index';
import { Button } from '../ui';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';
import AdminDrawer from './AdminDrawer';
import { AdminDetailSkeleton } from './AdminSkeletons';
import { adminToast } from './adminToast';

interface UserPreviewModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

function MetaTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3.5 flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 shrink-0">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        <p className="text-sm font-semibold text-white truncate" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center min-w-0">
      <p className="text-xl sm:text-2xl font-semibold text-white tabular-nums leading-none mb-1">
        {value}
      </p>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
        {label}
      </p>
    </div>
  );
}

function reportStatusClass(status: string) {
  const s = status.toUpperCase();
  if (s === 'PENDING' || s === 'REVIEWING') {
    return 'bg-amber-500/15 text-amber-400';
  }
  if (s === 'RESOLVED') {
    return 'bg-green-500/15 text-green-400';
  }
  return 'bg-white/10 text-gray-300';
}

/**
 * Admin user detail drawer (filename kept for import stability).
 * Renders via AdminDrawer — not a centered modal.
 */
export default function UserPreviewModal({
  userId,
  isOpen,
  onClose,
}: UserPreviewModalProps) {
  const { t, i18n } = useTranslation();
  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin', 'user-detail', userId],
    queryFn: () =>
      userId
        ? adminApi
            .getUserDetail(userId)
            .then((res) => res.data as AdminUserDetail)
        : Promise.reject(new Error('missing userId')),
    enabled: isOpen && !!userId,
  });

  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'es-ES';
  const username = user?.profile?.username;
  const profileHref = username ? `/${username}` : null;

  const copyId = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      adminToast(t('admin.user_preview.copied'), 'success');
    } catch {
      adminToast(t('admin.user_preview.copy_error'), 'error');
    }
  };

  return (
    <AdminDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t('admin.user_preview.title')}
      subtitle={username ? `@${username}` : undefined}
      width="lg"
    >
      {isLoading ? (
        <AdminDetailSkeleton />
      ) : isError || !user ? (
        <div className="py-16 text-center text-sm text-gray-400">
          {t('admin.user_preview.not_found')}
        </div>
      ) : (
        <div className="space-y-5 pb-4">
          {/* Profile header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-xl border border-white/5 bg-white/[0.03]">
            <div className="flex items-center gap-3.5 min-w-0">
              <UserAvatar
                src={user.profile?.avatar || undefined}
                thumbnailUrl={user.profile?.thumbnailUrl || undefined}
                standardUrl={user.profile?.standardUrl || undefined}
                alt={username || t('admin.user_preview.default_name')}
                size="lg"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 className="text-lg sm:text-xl font-semibold text-white tracking-tight truncate">
                    {user.profile?.fullName ||
                      t('admin.user_preview.default_name')}
                  </h3>
                  <VerificationBadge
                    level={user.verificationLevel as VerificationLevel}
                    size={16}
                  />
                </div>
                <p className="text-brand-primary font-semibold text-sm truncate">
                  @{username || '—'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0 sm:items-end">
              <span
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border text-center ${
                  user.isActive
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}
              >
                {user.isActive
                  ? t('admin.user_preview.account_active')
                  : t('admin.user_preview.account_banned')}
              </span>
              <span className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 border border-white/10 text-xs font-semibold uppercase tracking-wide text-center">
                {t('admin.user_preview.role_label', { role: user.role })}
              </span>
              {profileHref && (
                <a
                  href={profileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg text-sm font-semibold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-white transition-colors"
                >
                  <ExternalLink size={14} />
                  {t('admin.user_preview.open_profile')}
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MetaTile
              icon={Mail}
              label={t('admin.user_preview.email_label')}
              value={user.email}
            />
            <MetaTile
              icon={Calendar}
              label={t('admin.user_preview.member_since')}
              value={new Date(user.createdAt).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-4 border-b border-white/5 pb-5">
            <StatBlock
              label={t('admin.user_preview.stat_posts')}
              value={user._count.posts}
            />
            <StatBlock
              label={t('admin.user_preview.stat_followers')}
              value={user._count.followers}
            />
            <StatBlock
              label={t('admin.user_preview.stat_following')}
              value={user._count.following}
            />
          </div>

          {user.profile?.bio && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {t('admin.user_preview.bio_label')}
              </p>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                {user.profile.bio}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2 border-b border-white/5 pb-2">
              <Database size={14} />
              {t('admin.user_preview.system_data_title')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 min-w-0">
                <span className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                  <Fingerprint size={10} /> {t('admin.user_preview.uuid_label')}
                </span>
                <div className="flex items-center gap-1.5">
                  <p className="flex-1 min-w-0 text-xs font-mono text-gray-300 bg-black/40 px-2 py-1.5 rounded-lg truncate border border-white/5">
                    {user.id}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="w-9 h-9 shrink-0 text-gray-400 hover:text-white"
                    aria-label={t('admin.user_preview.copy_id')}
                    onClick={() => copyId(user.id)}
                  >
                    <Copy size={14} />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                  <ShieldCheck size={10} />{' '}
                  {t('admin.user_preview.verification_level_label')}
                </span>
                <p className="text-xs font-semibold text-white uppercase tracking-wider">
                  {user.verificationLevel ||
                    t('admin.user_preview.verification_none')}
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-gray-500 uppercase">
                  {t('admin.user_preview.account_type_label')}
                </span>
                <p className="text-xs font-semibold text-white uppercase tracking-wider">
                  {user.accountType ||
                    t('admin.user_preview.account_type_personal')}
                </p>
              </div>
              {user.identityVerifiedAt && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-emerald-500 uppercase">
                    {t('admin.user_preview.kyc_verified_at')}
                  </span>
                  <p className="text-xs font-semibold text-white">
                    {new Date(user.identityVerifiedAt).toLocaleString(locale)}
                  </p>
                </div>
              )}
              {user.stripeIdentitySessionId && (
                <div className="space-y-1.5 sm:col-span-2 min-w-0">
                  <span className="text-xs font-semibold text-indigo-400 uppercase">
                    {t('admin.user_preview.stripe_session_label')}
                  </span>
                  <p className="text-xs font-mono text-gray-300 truncate">
                    {user.stripeIdentitySessionId}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                <MessageSquare size={14} className="text-brand-primary" />
                {t('admin.user_preview.recent_posts')}
              </h4>
              <div className="space-y-2">
                {user.posts.slice(0, 3).map((post) => (
                  <a
                    key={post.id}
                    href={`/post/${post.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/5 transition-colors text-xs flex justify-between items-center gap-2 group"
                  >
                    <span className="text-gray-300 truncate min-w-0">
                      {post.caption || t('admin.user_preview.no_caption')}
                    </span>
                    <ExternalLink
                      size={12}
                      className="text-brand-primary shrink-0 opacity-70 group-hover:opacity-100"
                    />
                  </a>
                ))}
                {user.posts.length === 0 && (
                  <p className="text-xs text-gray-500 py-2">
                    {t('admin.user_preview.no_recent_activity')}
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertCircle size={14} className="text-red-400" />
                {t('admin.user_preview.reports_title')}
              </h4>
              <div className="space-y-2">
                {user.reports.slice(0, 3).map((report) => (
                  <div
                    key={report.id}
                    className="p-3 rounded-xl border border-red-500/10 bg-red-500/5 text-xs flex justify-between items-center gap-2"
                  >
                    <span className="text-red-200/90 font-semibold truncate min-w-0">
                      {report.reason}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${reportStatusClass(report.status)}`}
                    >
                      {t(
                        `admin.user_preview.report_status_${report.status.toLowerCase()}`,
                        report.status,
                      )}
                    </span>
                  </div>
                ))}
                {user.reports.length === 0 && (
                  <p className="text-xs text-gray-500 py-2">
                    {t('admin.user_preview.no_pending_reports')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminDrawer>
  );
}
