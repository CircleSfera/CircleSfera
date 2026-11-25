import { FOUNDING_CREATOR_NOTE_MAX_LENGTH } from '@circlesfera/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Sparkles } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type FoundingCreatorDeclineReason,
  foundingCreatorsStaffApi,
  type StaffFoundingCreatorApplication,
} from '../../services/foundingCreators.service';
import { formatDay } from '../../utils/format';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';
import { Textarea } from '../ui/Textarea';
import { ADMIN_PAGE_LIST_STATE, AdminEmptyState } from './AdminEmptyState';
import { AdminPageHeader } from './AdminPageHeader';
import { adminToast } from './adminToast';
import { isStepUpCancelled, useAdminStepUp } from './useAdminStepUp';

const REASONS: FoundingCreatorDeclineReason[] = [
  'LINKS_UNREACHABLE',
  'NOT_VIDEO_WORK',
  'OUTSIDE_LAUNCH_AREA',
  'PROGRAM_FULL',
  'OTHER',
];

// Founding creators (BD-034): the applications waiting for staff, oldest
// first (those of suspended or closing accounts are left out). Approving
// lets the person start the Verified plan free for a year from the app,
// accepting its terms; the person sees the decision there (nothing is sent
// to them). A decision asks the member of staff to prove again who they
// are.
export default function FoundingCreatorsTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'founding-creators'],
    queryFn: () => foundingCreatorsStaffApi.queue(),
  });
  const items = data?.items ?? [];

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.founding_creators.title')}
        subtitle={t('admin.founding_creators.subtitle', {
          count: data?.total ?? 0,
        })}
      />
      {isError ? (
        <div className={ADMIN_PAGE_LIST_STATE}>
          <AdminEmptyState
            icon={Sparkles}
            title={t('admin.founding_creators.load_failed')}
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                isLoading={isFetching}
                onClick={() => void refetch()}
              >
                <RefreshCw size={14} aria-hidden />
                {t('admin.founding_creators.retry')}
              </Button>
            }
          />
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : items.length === 0 ? (
        <div className={ADMIN_PAGE_LIST_STATE}>
          <AdminEmptyState
            icon={Sparkles}
            title={t('admin.founding_creators.empty_title')}
            description={t('admin.founding_creators.empty_description')}
          />
        </div>
      ) : (
        // The same cards on a phone and a wide screen: drawn once.
        <div className="grid gap-2 xl:grid-cols-2">
          {items.map((application) => (
            <ApplicationCard key={application.id} application={application} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationCard({
  application,
}: {
  application: StaffFoundingCreatorApplication;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] =
    useState<FoundingCreatorDeclineReason>('NOT_VIDEO_WORK');
  const [note, setNote] = useState('');

  const stepUp = useAdminStepUp();
  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      stepUp.run(() =>
        foundingCreatorsStaffApi.decide(
          application.id,
          approve
            ? { approve: true }
            : { approve: false, reason, note: note.trim() || undefined },
        ),
      ),
    onSuccess: (_res, approve) => {
      adminToast(
        t(
          approve
            ? 'admin.founding_creators.approved'
            : 'admin.founding_creators.declined',
        ),
        'success',
      );
      queryClient.invalidateQueries({
        queryKey: ['admin', 'founding-creators'],
      });
    },
    onError: (err) => {
      // Closing the confirmation is not a failure.
      if (isStepUpCancelled(err)) return;
      adminToast(t('admin.founding_creators.decide_failed'), 'error');
    },
  });

  const fact = (label: string, value: ReactNode) => (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-xs text-white/50 sm:w-32">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-white">{value}</dd>
    </div>
  );
  const identityVerified = !!application.profile.user?.identityVerifiedAt;

  return (
    <article
      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
      data-testid={`founding-application-${application.id}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-white">
          @{application.profile.username}
        </h3>
        <span className="text-xs text-white/50">
          {formatDay(application.createdAt, i18n.language)}
        </span>
      </header>
      <dl className="space-y-1.5">
        {fact(
          t('admin.founding_creators.links'),
          <span className="flex flex-col gap-1">
            {application.links.map((link) => (
              // Opened by staff in a new tab, never followed by the server.
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="truncate text-brand-primary-text underline-offset-2 hover:underline"
              >
                {link}
              </a>
            ))}
          </span>,
        )}
        {fact(t('admin.founding_creators.city'), application.city)}
        {application.note
          ? fact(t('admin.founding_creators.note'), application.note)
          : null}
        {fact(
          t('admin.founding_creators.identity'),
          identityVerified
            ? t('admin.founding_creators.yes')
            : t('admin.founding_creators.identity_missing'),
        )}
      </dl>

      {declining ? (
        <div className="space-y-2">
          <label
            className="block text-xs text-white/60"
            htmlFor={`founding-reason-${application.id}`}
          >
            {t('admin.founding_creators.reason')}
          </label>
          <select
            id={`founding-reason-${application.id}`}
            value={reason}
            onChange={(e) =>
              setReason(e.target.value as FoundingCreatorDeclineReason)
            }
            className="min-h-12 w-full rounded-xl border border-white/10 bg-surface-raised px-3 text-sm text-white"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`admin.founding_creators.reasons.${r}`)}
              </option>
            ))}
          </select>
          <Textarea
            label={t('admin.founding_creators.decline_note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={FOUNDING_CREATOR_NOTE_MAX_LENGTH}
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="min-h-11"
              isLoading={decide.isPending}
              onClick={() => decide.mutate(false)}
            >
              {t('admin.founding_creators.confirm_decline')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11"
              onClick={() => setDeclining(false)}
            >
              {t('admin.founding_creators.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="min-h-11"
            isLoading={decide.isPending}
            onClick={() => decide.mutate(true)}
          >
            {t('admin.founding_creators.approve')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => setDeclining(true)}
          >
            {t('admin.founding_creators.decline')}
          </Button>
        </div>
      )}
      {stepUp.dialog}
    </article>
  );
}
