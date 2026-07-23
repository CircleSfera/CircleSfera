import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Copy,
  Database,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminUserDetail } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { UserAvatar } from '../index';
import { Button } from '../ui';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';
import { AdminDetailSkeleton } from './AdminSkeletons';
import { adminToast } from './adminToast';

interface UserDetailPanelProps {
  userId: string;
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5 last:border-b-0">
      <dt className="text-xs font-medium text-gray-500 shrink-0 pt-0.5">
        {label}
      </dt>
      <dd className="text-sm text-white text-right min-w-0 break-all">
        {children}
      </dd>
    </div>
  );
}

function SystemField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <div className="text-sm text-white">{children}</div>
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

/** Compact user dossier for AdminSplitView detail pane (no overlay). */
export default function UserDetailPanel({ userId }: UserDetailPanelProps) {
  const { t, i18n } = useTranslation();
  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin', 'user-detail', userId],
    queryFn: () =>
      adminApi.getUserDetail(userId).then((res) => res.data as AdminUserDetail),
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

  if (isLoading) {
    return (
      <div className="p-1">
        <AdminDetailSkeleton />
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        {t('admin.user_preview.not_found')}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 px-0.5">
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {t('admin.user_preview.title')}
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <UserAvatar
              src={user.profile?.avatar || undefined}
              thumbnailUrl={user.profile?.thumbnailUrl || undefined}
              standardUrl={user.profile?.standardUrl || undefined}
              alt={username || t('admin.user_preview.default_name')}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="text-lg font-semibold text-white tracking-tight truncate">
                  {user.profile?.fullName ||
                    t('admin.user_preview.default_name')}
                </h3>
                <VerificationBadge
                  level={user.verificationLevel as VerificationLevel}
                  size={16}
                />
              </div>
              <p className="text-brand-primary font-medium text-sm truncate">
                @{username || '—'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide ${
                user.isActive
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {user.isActive
                ? t('admin.user_preview.account_active')
                : t('admin.user_preview.account_banned')}
            </span>
            <span className="inline-flex px-2.5 py-1 rounded-md bg-white/5 text-gray-300 text-[11px] font-semibold uppercase tracking-wide">
              {t('admin.user_preview.role_label', { role: user.role })}
            </span>
            {profileHref && (
              <a
                href={profileHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-md text-xs font-semibold text-brand-primary hover:bg-brand-primary/10 transition-colors"
              >
                <ExternalLink size={13} />
                {t('admin.user_preview.open_profile')}
              </a>
            )}
          </div>
        </div>
      </div>

      <dl>
        <MetaRow label={t('admin.user_preview.email_label')}>
          <span className="font-medium" title={user.email}>
            {user.email}
          </span>
        </MetaRow>
        <MetaRow label={t('admin.user_preview.member_since')}>
          {new Date(user.createdAt).toLocaleDateString(locale, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </MetaRow>
        <MetaRow label={t('admin.user_preview.uuid_label')}>
          <div className="inline-flex items-center gap-1 max-w-full">
            <span className="font-mono text-xs text-gray-300 truncate">
              {user.id}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-8 h-8 shrink-0 text-gray-400 hover:text-white"
              aria-label={t('admin.user_preview.copy_id')}
              onClick={() => copyId(user.id)}
            >
              <Copy size={13} />
            </Button>
          </div>
        </MetaRow>
      </dl>

      <div className="grid grid-cols-3 rounded-lg bg-white/[0.03] overflow-hidden">
        {(
          [
            ['stat_posts', user._count.posts],
            ['stat_followers', user._count.followers],
            ['stat_following', user._count.following],
          ] as const
        ).map(([key, value], i) => (
          <div
            key={key}
            className={`px-2 py-3 text-center min-w-0 ${
              i > 0 ? 'border-l border-white/5' : ''
            }`}
          >
            <p className="text-lg font-semibold text-white tabular-nums leading-none">
              {value}
            </p>
            <p className="mt-1 text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">
              {t(`admin.user_preview.${key}`)}
            </p>
          </div>
        ))}
      </div>

      {user.profile?.bio && (
        <div>
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            {t('admin.user_preview.bio_label')}
          </p>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {user.profile.bio}
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Database size={12} />
          {t('admin.user_preview.system_data_title')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <SystemField label={t('admin.user_preview.verification_level_label')}>
            <span className="font-medium uppercase tracking-wide text-xs">
              {user.verificationLevel ||
                t('admin.user_preview.verification_none')}
            </span>
          </SystemField>
          <SystemField label={t('admin.user_preview.account_type_label')}>
            <span className="font-medium uppercase tracking-wide text-xs">
              {user.accountType ||
                t('admin.user_preview.account_type_personal')}
            </span>
          </SystemField>
          {user.identityVerifiedAt && (
            <SystemField label={t('admin.user_preview.kyc_verified_at')}>
              <span className="text-xs font-medium">
                {new Date(user.identityVerifiedAt).toLocaleString(locale)}
              </span>
            </SystemField>
          )}
          {user.stripeIdentitySessionId && (
            <SystemField label={t('admin.user_preview.stripe_session_label')}>
              <span
                className="font-mono text-xs text-gray-300 truncate block"
                title={user.stripeIdentitySessionId}
              >
                {user.stripeIdentitySessionId}
              </span>
            </SystemField>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section>
          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <MessageSquare size={12} className="text-brand-primary" />
            {t('admin.user_preview.recent_posts')}
          </h4>
          <ul className="divide-y divide-white/5">
            {user.posts.slice(0, 3).map((post) => (
              <li key={post.id}>
                <a
                  href={`/post/${post.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 flex justify-between items-center gap-2 text-xs group"
                >
                  <span className="text-gray-300 truncate min-w-0 group-hover:text-white transition-colors">
                    {post.caption || t('admin.user_preview.no_caption')}
                  </span>
                  <ExternalLink
                    size={12}
                    className="text-gray-500 shrink-0 group-hover:text-brand-primary"
                  />
                </a>
              </li>
            ))}
          </ul>
          {user.posts.length === 0 && (
            <p className="text-xs text-gray-500 py-1">
              {t('admin.user_preview.no_recent_activity')}
            </p>
          )}
        </section>

        <section>
          <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <AlertCircle size={12} className="text-red-400" />
            {t('admin.user_preview.reports_title')}
          </h4>
          <ul className="divide-y divide-white/5">
            {user.reports.slice(0, 3).map((report) => (
              <li
                key={report.id}
                className="py-2 flex justify-between items-center gap-2 text-xs"
              >
                <span className="text-gray-300 truncate min-w-0">
                  {report.reason}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${reportStatusClass(report.status)}`}
                >
                  {t(
                    `admin.user_preview.report_status_${report.status.toLowerCase()}`,
                    report.status,
                  )}
                </span>
              </li>
            ))}
          </ul>
          {user.reports.length === 0 && (
            <p className="text-xs text-gray-500 py-1">
              {t('admin.user_preview.no_pending_reports')}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
