import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, FileText, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type CompanyRejectionReason,
  companyVerificationStaffApi,
  type StaffCompanyApplication,
} from '../../services/companyVerification.service';
import { formatDay } from '../../utils/format';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';
import { Textarea } from '../ui/Textarea';
import { ADMIN_PAGE_LIST_STATE, AdminEmptyState } from './AdminEmptyState';
import { AdminPageHeader } from './AdminPageHeader';
import { adminToast } from './adminToast';

const REASONS: CompanyRejectionReason[] = [
  'DOCUMENTS_UNREADABLE',
  'DOCUMENTS_NOT_ACCEPTED',
  'DETAILS_DO_NOT_MATCH',
  'NAME_NOT_IDENTITY',
  'OTHER',
];
const NOTE_MAX = 500;

// The company verifications waiting for staff, oldest first. A decision
// deletes the documents; the person is told in the app and by email.
export default function CompanyVerificationsTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'company-verifications'],
    queryFn: () => companyVerificationStaffApi.queue(),
  });
  const items = data?.items ?? [];

  const rows = (
    <div className="space-y-2">
      {items.map((application) => (
        <ApplicationCard key={application.id} application={application} />
      ))}
    </div>
  );

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.company_verifications.title')}
        subtitle={t('admin.company_verifications.subtitle', {
          count: data?.total ?? 0,
        })}
      />
      {isError ? (
        <div className={ADMIN_PAGE_LIST_STATE}>
          <AdminEmptyState
            icon={Briefcase}
            title={t('admin.company_verifications.load_failed')}
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
                {t('admin.company_verifications.retry')}
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
            icon={Briefcase}
            title={t('admin.company_verifications.empty_title')}
            description={t('admin.company_verifications.empty_description')}
          />
        </div>
      ) : (
        // The same cards on a phone and a wide screen: drawn once.
        rows
      )}
    </div>
  );
}

function ApplicationCard({
  application,
}: {
  application: StaffCompanyApplication;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<CompanyRejectionReason>(
    'DOCUMENTS_UNREADABLE',
  );
  const [note, setNote] = useState('');
  // Read when asked, kept only on this screen.
  const [identityName, setIdentityName] = useState<
    { firstName: string; lastName: string } | null | undefined
  >(undefined);
  const readName = useMutation({
    mutationFn: () => companyVerificationStaffApi.identityName(application.id),
    onSuccess: (res) => setIdentityName(res.name),
    onError: () =>
      adminToast(
        t('admin.company_verifications.identity_name_failed'),
        'error',
      ),
  });

  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      companyVerificationStaffApi.decide(
        application.id,
        approve
          ? { approve: true }
          : { approve: false, reason, note: note.trim() || undefined },
      ),
    onSuccess: (_res, approve) => {
      adminToast(
        t(
          approve
            ? 'admin.company_verifications.approved'
            : 'admin.company_verifications.rejected',
        ),
        'success',
      );
      queryClient.invalidateQueries({
        queryKey: ['admin', 'company-verifications'],
      });
    },
    onError: () =>
      adminToast(t('admin.company_verifications.decide_failed'), 'error'),
  });

  // Opens a document in a new tab from memory; nothing is kept.
  // The tab is opened during the click, so the browser does not block it
  // however long the download takes, and filled once it arrives.
  const open = async (documentId: string) => {
    const tab = window.open('', '_blank');
    if (!tab) {
      adminToast(t('admin.company_verifications.document_blocked'), 'error');
      return;
    }
    tab.opener = null;
    try {
      const blob = await companyVerificationStaffApi.document(
        application.id,
        documentId,
      );
      const url = URL.createObjectURL(blob);
      tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab.close();
      adminToast(t('admin.company_verifications.document_failed'), 'error');
    }
  };

  const yes = t('admin.company_verifications.yes');
  const no = t('admin.company_verifications.no');
  const fact = (label: string, value: string) => (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-xs text-white/50 sm:w-40">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-white">{value}</dd>
    </div>
  );

  return (
    <article
      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
      data-testid={`company-application-${application.id}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-white">
          {application.legalName}
        </h3>
        <span className="text-xs text-white/50">
          @{application.profile.username} ·{' '}
          {application.submittedAt
            ? formatDay(application.submittedAt, i18n.language)
            : ''}
        </span>
      </header>
      <dl className="space-y-1.5">
        {fact(
          t('admin.company_verifications.kind'),
          t(`admin.company_verifications.kinds.${application.kind}`),
        )}
        {fact(t('admin.company_verifications.tax_id'), application.taxId)}
        {fact(
          t('admin.company_verifications.vies'),
          application.viesValid === null
            ? t('admin.company_verifications.vies_unknown')
            : application.viesValid
              ? `${yes}${application.viesName ? ` · ${application.viesName}` : ''}`
              : no,
        )}
        {fact(
          t('admin.company_verifications.domain'),
          application.domain
            ? `${application.domain} · ${
                application.domainProof
                  ? t(
                      `admin.company_verifications.proof_${application.domainProof}`,
                    )
                  : no
              }`
            : t('admin.company_verifications.no_domain'),
        )}
        {application.domain
          ? fact(
              t('admin.company_verifications.email'),
              application.emailVerifiedAt && application.emailAddress
                ? application.emailAddress
                : no,
            )
          : null}
        {fact(
          t('admin.company_verifications.identity'),
          application.profile.user?.identityVerifiedAt ? yes : no,
        )}
        {identityName !== undefined
          ? fact(
              t('admin.company_verifications.identity_name'),
              identityName
                ? `${identityName.firstName} ${identityName.lastName}`.trim()
                : t('admin.company_verifications.identity_name_none'),
            )
          : null}
      </dl>
      {application.kind === 'SOLE_TRADER' && identityName === undefined ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          isLoading={readName.isPending}
          onClick={() => readName.mutate()}
        >
          {t('admin.company_verifications.show_identity_name')}
        </Button>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {application.documents.map((doc) => (
          <Button
            key={doc.id}
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => void open(doc.id)}
          >
            <FileText size={14} aria-hidden />
            {doc.fileName}
          </Button>
        ))}
      </div>

      {rejecting ? (
        <div className="space-y-2">
          <label
            className="block text-xs text-white/60"
            htmlFor={`reason-${application.id}`}
          >
            {t('admin.company_verifications.reason')}
          </label>
          <select
            id={`reason-${application.id}`}
            value={reason}
            onChange={(e) =>
              setReason(e.target.value as CompanyRejectionReason)
            }
            className="min-h-12 w-full rounded-xl border border-white/10 bg-surface-raised px-3 text-sm text-white"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`admin.company_verifications.reasons.${r}`)}
              </option>
            ))}
          </select>
          <Textarea
            label={t('admin.company_verifications.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
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
              {t('admin.company_verifications.confirm_reject')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11"
              onClick={() => setRejecting(false)}
            >
              {t('admin.company_verifications.cancel')}
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
            {t('admin.company_verifications.approve')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => setRejecting(true)}
          >
            {t('admin.company_verifications.reject')}
          </Button>
        </div>
      )}
    </article>
  );
}
