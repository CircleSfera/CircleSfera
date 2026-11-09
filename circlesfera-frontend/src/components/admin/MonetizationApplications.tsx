import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adminApi,
  type MonetizationApplication,
} from '../../services/admin.service';
import type { MonetizationProgrammeStatus } from '../../services/monetization.service';
import { formatDay } from '../../utils/format';
import { Button } from '../ui';
import { BUTTON_PAIR } from '../ui/buttonWidth';
import { Dialog } from '../ui/Dialog';
import { Textarea } from '../ui/Textarea';
import { AdminEmptyState } from './AdminEmptyState';
import { ADMIN_PAGE_ROW, AdminListRow } from './AdminList';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { AdminListSkeleton } from './AdminSkeletons';
import { Pagination } from './AdminTable';
import { adminToast } from './adminToast';

const STATUSES: MonetizationProgrammeStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVOKED',
];

type Decision = 'approve' | 'reject' | 'revoke';

// The monetization programme in the Admin Panel: applications from Creator
// and Business Profiles, oldest first, which staff approve, refuse or
// revoke. A refusal and a revocation carry the reason the creator reads.
export default function MonetizationApplications() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MonetizationProgrammeStatus>('PENDING');
  const [page, setPage] = useState(1);
  const [asking, setAsking] = useState<{
    profile: MonetizationApplication;
    decision: Exclude<Decision, 'approve'>;
  } | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'monetizationApplications', status, page],
    queryFn: () =>
      adminApi
        .getMonetizationApplications(status, page)
        .then((res) => res.data),
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; decision: Decision; note?: string }) =>
      adminApi.decideMonetizationApplication(
        input.id,
        input.decision,
        input.note,
      ),
    onSuccess: (_res, input) => {
      adminToast(t(`admin.monetization.programme.done.${input.decision}`));
      setAsking(null);
      setReason('');
      queryClient.invalidateQueries({
        queryKey: ['admin', 'monetizationApplications'],
      });
    },
    onError: () => adminToast(t('admin.monetization.programme.error'), 'error'),
  });

  const items = data?.items ?? [];

  return (
    <section className="space-y-3" aria-labelledby="monetization-programme">
      <div>
        <h2
          id="monetization-programme"
          className="text-base font-semibold text-white"
        >
          {t('admin.monetization.programme.title')}
        </h2>
        <p className="text-sm text-white/60">
          {t('admin.monetization.programme.subtitle')}
        </p>
      </div>
      <AdminSegmentedControl
        ariaLabel={t('admin.monetization.programme.filter')}
        options={STATUSES.map((value) => ({
          value,
          label: t(`admin.monetization.programme.status.${value}`),
        }))}
        value={status}
        onChange={(value) => {
          setStatus(value as MonetizationProgrammeStatus);
          setPage(1);
        }}
      />

      {isLoading ? (
        <AdminListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <AdminEmptyState title={t('admin.monetization.programme.empty')} />
      ) : (
        <ul className="space-y-2">
          {items.map((profile) => (
            <li key={profile.id}>
              <AdminListRow
                className={ADMIN_PAGE_ROW}
                title={`@${profile.username}`}
                subtitle={profile.monetizationPitch ?? undefined}
                meta={[
                  t(
                    `admin.monetization.programme.type.${profile.accountType}`,
                    {
                      defaultValue: profile.accountType,
                    },
                  ),
                  t('admin.monetization.programme.counts', {
                    followers: profile._count.followers,
                    posts: profile._count.posts,
                  }),
                  profile.monetizationAppliedAt
                    ? t('admin.monetization.programme.applied', {
                        date: formatDay(
                          profile.monetizationAppliedAt,
                          i18n.language,
                        ),
                      })
                    : null,
                  profile.monetizationNote,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                primaryAction={
                  status === 'PENDING' ? (
                    <div className={BUTTON_PAIR}>
                      <Button
                        size="md"
                        variant="outline"
                        onClick={() =>
                          setAsking({ profile, decision: 'reject' })
                        }
                      >
                        {t('admin.monetization.programme.reject')}
                      </Button>
                      <Button
                        size="md"
                        onClick={() =>
                          decide.mutate({ id: profile.id, decision: 'approve' })
                        }
                        isLoading={
                          decide.isPending &&
                          decide.variables?.id === profile.id
                        }
                      >
                        {t('admin.monetization.programme.approve')}
                      </Button>
                    </div>
                  ) : status === 'APPROVED' ? (
                    <Button
                      size="md"
                      variant="danger"
                      onClick={() => setAsking({ profile, decision: 'revoke' })}
                    >
                      {t('admin.monetization.programme.revoke')}
                    </Button>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        meta={
          data
            ? {
                total: data.total,
                page: data.page,
                limit: 20,
                totalPages: data.totalPages,
              }
            : undefined
        }
        onPageChange={setPage}
      />

      <Dialog
        isOpen={asking !== null}
        onClose={() => {
          setAsking(null);
          setReason('');
        }}
        title={
          asking
            ? t(`admin.monetization.programme.ask.${asking.decision}`, {
                username: asking.profile.username,
              })
            : ''
        }
        maxWidth="md"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (asking && reason.trim()) {
              decide.mutate({
                id: asking.profile.id,
                decision: asking.decision,
                note: reason.trim(),
              });
            }
          }}
        >
          <Textarea
            label={t('admin.monetization.programme.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
          />
          <p className="text-xs text-white/50">
            {t('admin.monetization.programme.reason_hint')}
          </p>
          <div className={BUTTON_PAIR}>
            <Button
              type="submit"
              variant="danger"
              size="md"
              disabled={!reason.trim()}
              isLoading={decide.isPending}
            >
              {asking
                ? t(`admin.monetization.programme.${asking.decision}`)
                : ''}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
