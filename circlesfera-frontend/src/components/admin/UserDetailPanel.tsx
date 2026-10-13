import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Copy,
  Database,
  ExternalLink,
  Film,
  Flag,
  ImageIcon,
  MessageSquare,
  MonitorSmartphone,
  Radio,
  ScrollText,
  ShieldAlert,
  StickyNote,
} from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { AdminUserDetail } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { platformOrigin } from '../../utils/adminPanel';
import { formatDateTime, formatDay } from '../../utils/format';
import { UserAvatar } from '../index';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';
import { AdminDetailSkeleton } from './AdminSkeletons';
import { type AdminTab, adminTabPath } from './adminNav';
import { adminToast } from './adminToast';
import ProfileSuspensions from './ProfileSuspensions';

interface UserDetailPanelProps {
  userId: string;
  // What can be done to the account from its record, given by the screen
  // that opens it.
  actions?: ReactNode;
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5 last:border-b-0">
      <dt className="text-xs font-medium text-white/50 shrink-0 pt-0.5">
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
      <p className="text-[11px] font-medium text-white/50 uppercase tracking-wide">
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
  return 'bg-white/10 text-white/70';
}

function ActivityChip({
  icon: Icon,
  label,
  count,
  onClick,
}: {
  icon: typeof ImageIcon;
  label: string;
  // A link with nothing to count has none.
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass-panel border border-white/10 hover:border-brand-primary/30 hover:bg-brand-primary/10 transition-colors text-left min-h-11"
    >
      <Icon size={13} className="text-brand-primary-text shrink-0" />
      <span className="text-[11px] font-semibold text-white/70">{label}</span>
      {count !== undefined && (
        <span className="text-xs font-bold text-white tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

// What the staff knows about the account, left for the next staff member.
// Notes are added, never edited or deleted, and the holder never sees them.
function StaffNotes({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const [draft, setDraft] = useState('');
  const key = ['admin', 'staff-notes', userId];
  const { data: notes } = useQuery({
    queryKey: key,
    queryFn: () => adminApi.getStaffNotes(userId).then((res) => res.data),
  });
  const add = useMutation({
    mutationFn: () => adminApi.addStaffNote(userId, draft.trim()),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => adminToast(t('admin.user_preview.note_error'), 'error'),
  });

  return (
    <section className="space-y-2.5">
      <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
        <StickyNote size={12} />
        {t('admin.user_preview.notes_title')}
      </h4>
      <p className="text-[11px] text-white/50 leading-snug">
        {t('admin.user_preview.notes_hint')}
      </p>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) add.mutate();
        }}
      >
        <label htmlFor={fieldId} className="sr-only">
          {t('admin.user_preview.note_label')}
        </label>
        <textarea
          id={fieldId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder={t('admin.user_preview.note_placeholder')}
          className="w-full min-h-12 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50 resize-y focus:outline-none focus:border-brand-primary/60"
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="min-h-11 sm:min-h-9 text-xs"
          disabled={!draft.trim() || add.isPending}
          isLoading={add.isPending}
        >
          {t('admin.user_preview.note_add')}
        </Button>
      </form>
      {notes && notes.length === 0 && (
        <p className="text-xs text-white/50">
          {t('admin.user_preview.notes_empty')}
        </p>
      )}
      {notes && notes.length > 0 && (
        <ul className="divide-y divide-white/5">
          {notes.map((note) => (
            <li key={note.id} className="py-2 first:pt-0">
              <p className="text-sm text-white whitespace-pre-wrap wrap-break-word">
                {note.body}
              </p>
              <p className="mt-0.5 text-[11px] text-white/50">
                {[
                  note.author ?? t('admin.user_preview.note_no_author'),
                  formatDateTime(note.createdAt, i18n.language),
                ].join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Where the account is signed in, and the way to sign it out everywhere
// without sanctioning it: what a compromised account needs.
function Sessions({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canClose = useAdminAuthStore((s) => s.hasPermission('users.write'));
  const [asking, setAsking] = useState(false);
  const key = ['admin', 'open-sessions', userId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => adminApi.getOpenSessions(userId).then((res) => res.data),
  });
  const close = useMutation({
    mutationFn: () =>
      adminApi.closeUserSessions(userId).then((res) => res.data),
    onSuccess: ({ closed }) => {
      setAsking(false);
      adminToast(
        t('admin.user_preview.sessions_closed', { count: closed }),
        'success',
      );
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () =>
      adminToast(t('admin.user_preview.sessions_close_error'), 'error'),
  });
  const open = data?.open;

  return (
    <section className="space-y-2.5">
      <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
        <MonitorSmartphone size={12} />
        {t('admin.user_preview.sessions_title')}
      </h4>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/70 min-w-0">
          {open === undefined
            ? t('admin.user_preview.sessions_unknown')
            : t('admin.user_preview.sessions_open', { count: open })}
        </p>
        {canClose && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 sm:min-h-9 text-xs shrink-0"
            disabled={!open || close.isPending}
            onClick={() => setAsking(true)}
          >
            {t('admin.user_preview.sessions_close')}
          </Button>
        )}
      </div>
      <ConfirmModal
        isOpen={asking}
        onClose={() => setAsking(false)}
        onConfirm={() => close.mutate()}
        title={t('admin.user_preview.sessions_close')}
        message={t('admin.user_preview.sessions_close_message', {
          count: open ?? 0,
        })}
        confirmText={t('admin.user_preview.sessions_close_confirm')}
        cancelText={t('admin.shared.cancel')}
        isLoading={close.isPending}
      />
    </section>
  );
}

// Compact user dossier for AdminSplitView detail pane (no overlay).
export default function UserDetailPanel({
  userId,
  actions,
}: UserDetailPanelProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canSanction = useAdminAuthStore((s) => s.hasPermission('users.ban'));
  const canReadAudit = useAdminAuthStore((s) => s.hasPermission('audit'));
  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin', 'user-detail', userId],
    queryFn: () =>
      adminApi.getUserDetail(userId).then((res) => res.data as AdminUserDetail),
  });

  const { data: trust } = useQuery({
    queryKey: ['admin', 'trust-score', userId],
    queryFn: () => adminApi.getTrustScore(userId).then((r) => r.data),
    enabled: !!userId,
  });

  const { data: linked } = useQuery({
    queryKey: ['admin', 'linked-accounts', userId],
    queryFn: () => adminApi.getLinkedAccounts(userId).then((r) => r.data),
    enabled: !!userId,
  });

  const [askingBotReason, setAskingBotReason] = useState(false);
  const botLabelMutation = useMutation({
    mutationFn: async (reason: string | null) =>
      reason === null
        ? adminApi.clearBotLabel(userId)
        : adminApi.applyBotLabel(userId, reason),
    onSuccess: () => {
      setAskingBotReason(false);
      adminToast(
        t('admin.user_preview.bot_label_updated', 'Updated'),
        'success',
      );
      queryClient.invalidateQueries({
        queryKey: ['admin', 'user-detail', userId],
      });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'trust-score', userId],
      });
    },
    onError: () => {
      adminToast(t('admin.user_preview.bot_label_error', 'Failed'), 'error');
    },
  });

  const username = user?.profile?.username;
  const profileHref = username ? `${platformOrigin()}/${username}` : null;
  const botLabeled = !!(
    user as AdminUserDetail & { botLabeledAt?: string | null }
  )?.botLabeledAt;

  const openQueue = (tab: AdminTab) => {
    navigate(`${adminTabPath(tab)}?userId=${encodeURIComponent(userId)}`);
  };

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
      <div className="py-16 text-center text-sm text-white/50">
        {t('admin.user_preview.not_found')}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 sm:space-y-3 pb-4 sm:pb-6 px-0.5">
      <div>
        <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wide mb-3">
          {t('admin.user_preview.title')}
        </p>
        {actions && <div className="mb-3 flex flex-wrap gap-2">{actions}</div>}
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
              <p className="text-brand-primary-text font-medium text-sm truncate">
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
            <span className="inline-flex px-2.5 py-1 rounded-md bg-white/5 text-white/70 text-[11px] font-semibold uppercase tracking-wide">
              {t('admin.user_preview.role_label', {
                role:
                  user.role === 'ADMIN'
                    ? t('admin.users.role_admin')
                    : t('admin.users.role_user'),
              })}
            </span>
            {profileHref && (
              <a
                href={profileHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 min-h-11 px-2.5 rounded-md text-xs font-semibold text-brand-primary-text hover:bg-brand-primary/10 transition-colors"
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
          {formatDay(user.createdAt, i18n.language)}
        </MetaRow>
        <MetaRow label={t('admin.user_preview.signup_ip', 'Signup IP')}>
          <span className="font-mono text-xs text-white/70">
            {user.signupIp || '—'}
          </span>
        </MetaRow>
        <MetaRow label={t('admin.user_preview.last_ip', 'Last IP')}>
          <span className="font-mono text-xs text-white/70">
            {user.lastIp || '—'}
          </span>
        </MetaRow>
        <MetaRow label={t('admin.user_preview.uuid_label')}>
          <div className="inline-flex items-center gap-1 max-w-full">
            <span className="font-mono text-xs text-white/70 truncate">
              {user.id}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-white/50 hover:text-white"
              aria-label={t('admin.user_preview.copy_id')}
              onClick={() => copyId(user.id)}
            >
              <Copy size={13} />
            </Button>
          </div>
        </MetaRow>
      </dl>

      <div className="grid grid-cols-3 rounded-lg bg-white/3 overflow-hidden">
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
            <p className="mt-1 text-[11px] font-medium text-white/50 uppercase tracking-wide truncate">
              {t(`admin.user_preview.${key}`)}
            </p>
          </div>
        ))}
      </div>

      {(trust || linked) && (
        <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
              <ShieldAlert size={12} aria-hidden />
              {t('admin.user_preview.trust_title', 'Trust signals')}
            </h4>
            {trust && (
              <span className="text-sm font-bold tabular-nums text-white">
                {trust.score}/100
              </span>
            )}
          </div>
          {trust?.factors?.length ? (
            <ul className="space-y-1">
              {trust.factors.map((f) => (
                <li
                  key={f.key}
                  className="flex justify-between text-[11px] text-white/60"
                >
                  <span>{f.label}</span>
                  <span
                    className={f.delta >= 0 ? 'text-green-400' : 'text-red-400'}
                  >
                    {f.delta > 0 ? `+${f.delta}` : f.delta}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {linked && (
            <p className="text-[11px] text-white/50">
              {t('admin.user_preview.cluster_size', {
                defaultValue: 'Linked accounts in cluster: {{count}}',
                count: linked.clusterSize,
              })}
            </p>
          )}
          {canSanction && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 text-xs"
                disabled={botLabelMutation.isPending || botLabeled}
                onClick={() => setAskingBotReason(true)}
              >
                {t(
                  'admin.user_preview.apply_bot_label',
                  'Label as possible bot',
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 text-xs"
                disabled={botLabelMutation.isPending || !botLabeled}
                onClick={() => botLabelMutation.mutate(null)}
              >
                {t('admin.user_preview.clear_bot_label', 'Clear bot label')}
              </Button>
              <ConfirmModal
                isOpen={askingBotReason}
                onClose={() => setAskingBotReason(false)}
                onConfirm={(reason) => {
                  if (reason) botLabelMutation.mutate(reason);
                }}
                title={t('admin.user_preview.apply_bot_label')}
                message={t('admin.user_preview.bot_label_message')}
                confirmText={t('admin.user_preview.bot_label_confirm')}
                cancelText={t('admin.shared.cancel')}
                isLoading={botLabelMutation.isPending}
                showInput
                inputRequired
                inputLabel={t('admin.user_preview.bot_label_prompt')}
              />
            </div>
          )}
        </section>
      )}

      {user.profile?.bio && (
        <div>
          <p className="text-[11px] font-medium text-white/50 uppercase tracking-wide mb-1.5">
            {t('admin.user_preview.bio_label')}
          </p>
          <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
            {user.profile.bio}
          </p>
        </div>
      )}

      <section className="space-y-2">
        <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide">
          {t('admin.user_preview.activity_title')}
        </h4>
        <p className="text-[11px] text-white/50 leading-snug">
          {t('admin.user_preview.activity_hint')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <ActivityChip
            icon={ImageIcon}
            label={t('admin.user_preview.chip_posts')}
            count={user._count.posts}
            onClick={() => openQueue('posts')}
          />
          <ActivityChip
            icon={MessageSquare}
            label={t('admin.user_preview.chip_comments')}
            count={user._count.comments}
            onClick={() => openQueue('comments')}
          />
          <ActivityChip
            icon={Film}
            label={t('admin.user_preview.chip_stories')}
            count={user._count.stories}
            onClick={() => openQueue('stories')}
          />
          <ActivityChip
            icon={Radio}
            label={t('admin.user_preview.chip_live')}
            count={user._count.liveStreams}
            onClick={() => openQueue('live')}
          />
          <ActivityChip
            icon={Flag}
            label={t('admin.user_preview.chip_reports')}
            count={user._count.reportsAgainst}
            onClick={() => openQueue('reports')}
          />
          {canReadAudit && (
            <ActivityChip
              icon={ScrollText}
              label={t('admin.user_preview.chip_audit')}
              onClick={() => openQueue('audit')}
            />
          )}
        </div>
      </section>

      {user.profiles && user.profiles.length > 0 && (
        <ProfileSuspensions userId={userId} profiles={user.profiles} />
      )}

      <Sessions userId={userId} />

      <StaffNotes userId={userId} />

      <section className="space-y-3">
        <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
          <Database size={12} />
          {t('admin.user_preview.system_data_title')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
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
                {formatDateTime(user.identityVerifiedAt, i18n.language)}
              </span>
            </SystemField>
          )}
          {user.stripeIdentitySessionId && (
            <SystemField label={t('admin.user_preview.stripe_session_label')}>
              <span
                className="font-mono text-xs text-white/70 truncate block"
                title={user.stripeIdentitySessionId}
              >
                {user.stripeIdentitySessionId}
              </span>
            </SystemField>
          )}
        </div>
      </section>

      <section>
        <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <AlertCircle size={12} className="text-red-400" />
          {t('admin.user_preview.reports_title')}
        </h4>
        <ul className="divide-y divide-white/5">
          {user.reports.map((report) => (
            <li
              key={report.id}
              className="py-2 flex justify-between items-center gap-2 text-xs"
            >
              <span className="text-white/70 truncate min-w-0">
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
          <p className="text-xs text-white/50 py-1">
            {t('admin.user_preview.no_pending_reports')}
          </p>
        )}
      </section>

      <section data-testid="user-strikes">
        <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <AlertCircle size={12} className="text-amber-400" />
          {t('admin.user_preview.strikes_title', {
            count: user.strikeCount ?? 0,
          })}
        </h4>
        <ul className="divide-y divide-white/5">
          {(user.strikes ?? []).map((strike) => (
            <li key={strike.id} className="py-2 space-y-0.5 text-xs">
              <div className="flex justify-between items-center gap-2">
                <span className="text-white/80 truncate min-w-0">
                  {strike.kind === 'WARNING'
                    ? t('settings.appeals.strike_kind_warning')
                    : t('settings.appeals.strike_kind_strike')}
                  {' · '}
                  {t(`settings.appeals.strike_reason.${strike.reason}`)}
                  {' · @'}
                  {strike.username}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${
                    strike.status === 'ACTIVE'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-white/5 text-white/50'
                  }`}
                >
                  {t(
                    `settings.appeals.strike_status_${strike.status.toLowerCase()}`,
                  )}
                </span>
              </div>
              <p className="text-white/50">
                {formatDay(strike.createdAt, i18n.language)}
                {' → '}
                {formatDay(strike.expiresAt, i18n.language)}
                {strike.consequence === 'SUSPENDED'
                  ? ` · ${t('settings.appeals.strike_consequence_suspended')}`
                  : strike.consequence === 'BANNED'
                    ? ` · ${t('settings.appeals.strike_consequence_banned')}`
                    : ''}
              </p>
            </li>
          ))}
        </ul>
        {(user.strikes ?? []).length === 0 && (
          <p className="text-xs text-white/50 py-1">
            {t('admin.user_preview.no_strikes')}
          </p>
        )}
      </section>
    </div>
  );
}
