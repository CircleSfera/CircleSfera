import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, Copy, FileText, Trash2 } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  type CompanyApplication,
  type CompanyDetails,
  type CompanyKind,
  type CompanyVerificationStatusView,
  companyVerificationApi,
} from '../../services/companyVerification.service';
import { useAuthStore } from '../../stores/authStore';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { promptIdentityVerification } from '../../utils/identityVerification';
import { ErrorState } from '../ErrorEmptyStates';
import { LoadingSpinner } from '../LoadingStates';
import { Button, Input } from '../ui';
import { SegmentedControl } from '../ui/SegmentedControl';
import SettingsSection from './SettingsSection';

// The documents accepted, as the file picker offers them.
const DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_DOCUMENTS = 3;

const card =
  'flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-left';

// "Verified company": a Business Profile on the Business plan, with a
// verified identity, shows the company behind it. The steps follow the
// server: the company, its domain, a code sent there, the documents, and
// staff review.
export default function CompanySettings() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const accountType = useAuthStore((s) => s.profile?.accountType);
  const isBusiness = accountType === 'BUSINESS';

  const status = useQuery({
    queryKey: ['companyVerification'],
    queryFn: () => companyVerificationApi.status(),
    enabled: isBusiness,
    retry: false,
  });

  const settle = (next: CompanyVerificationStatusView) =>
    queryClient.setQueryData(['companyVerification'], next);
  const failed = (fallback: string) => (err: unknown) =>
    toast.error(apiErrorMessage(err, t, fallback));

  const withdraw = useMutation({
    mutationFn: () => companyVerificationApi.withdraw(),
    onSuccess: (next) => {
      settle(next);
      toast.success(t('settings.company.withdrawn'));
    },
    onError: failed('settings.company.error'),
  });

  const title = t('settings.company.title');
  if (!isBusiness) {
    return (
      <SettingsSection title={title} description={t('settings.company.intro')}>
        <p className="p-4 text-sm text-white/70">
          {t('settings.company.business_only')}
        </p>
      </SettingsSection>
    );
  }
  if (status.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    );
  }
  if (status.isError || !status.data) {
    return (
      <ErrorState
        title={t('settings.company.error_title')}
        message={t('settings.company.error')}
        onRetry={() => status.refetch()}
      />
    );
  }

  const view = status.data;
  const application = view.application;
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString(i18n.language, {
          dateStyle: 'long',
        })
      : '';

  let body: React.ReactNode;
  if (!view.onBusinessPlan) {
    body = (
      <div className={card}>
        <p className="text-sm text-white/70">
          {t('settings.company.needs_plan')}
        </p>
        <Link
          to="/pricing"
          className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
        >
          {t('settings.company.see_plans')}
        </Link>
      </div>
    );
  } else if (!view.identityVerified) {
    body = (
      <div className={card}>
        <p className="text-sm text-white/70">
          {t('settings.company.needs_identity')}
        </p>
        <Button
          variant="white"
          onClick={() => promptIdentityVerification(t)}
          className="min-h-11 self-start px-5 text-sm font-semibold"
        >
          {t('settings.company.verify_identity')}
        </Button>
      </div>
    );
  } else if (application?.status === 'APPROVED') {
    body = (
      <div className={card} data-testid="company-approved">
        <p className="flex items-center gap-2 text-base font-semibold text-white">
          <CheckCircle2 size={18} className="text-emerald-400" aria-hidden />
          {t('settings.company.approved_title')}
        </p>
        <p className="text-sm text-white/70">
          {t('settings.company.approved_body', {
            name: application.legalName,
          })}
        </p>
        <p className="text-xs text-white/50">
          {t('settings.company.change_hint')}
        </p>
      </div>
    );
  } else if (application?.status === 'PENDING') {
    body = (
      <div className={card} data-testid="company-pending">
        <p className="text-base font-semibold text-white">
          {t('settings.company.pending_title')}
        </p>
        <p className="text-sm text-white/70">
          {t('settings.company.pending_body', {
            date: date(application.submittedAt),
          })}
        </p>
        <Button
          variant="secondary"
          onClick={() => withdraw.mutate()}
          isLoading={withdraw.isPending}
          className="min-h-11 self-start px-5 text-sm font-semibold"
        >
          {t('settings.company.withdraw')}
        </Button>
      </div>
    );
  } else if (application?.status === 'DRAFT') {
    body = (
      <DraftSteps
        view={view}
        application={application}
        onChange={settle}
        onWithdraw={() => withdraw.mutate()}
        withdrawing={withdraw.isPending}
      />
    );
  } else {
    // No application, or a rejected one: the details start a new one.
    body = (
      <>
        {application?.status === 'REJECTED' ? (
          <div className={card} data-testid="company-rejected">
            <p className="text-base font-semibold text-white">
              {t('settings.company.rejected_title')}
            </p>
            <p className="text-sm text-white/70">
              {t(
                `settings.company.reasons.${application.rejectionReason ?? 'OTHER'}`,
              )}
              {application.rejectionNote ? ` ${application.rejectionNote}` : ''}
            </p>
          </div>
        ) : null}
        <DetailsForm onSaved={settle} />
      </>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <SettingsSection
        title={title}
        description={t('settings.company.intro')}
        card={false}
      >
        {body}
      </SettingsSection>
    </div>
  );
}

function DetailsForm({
  initial,
  onSaved,
}: {
  initial?: CompanyApplication;
  onSaved: (next: CompanyVerificationStatusView) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<CompanyKind>(initial?.kind ?? 'COMPANY');
  const [legalName, setLegalName] = useState(initial?.legalName ?? '');
  const [taxId, setTaxId] = useState(initial?.taxId ?? '');
  const [domain, setDomain] = useState(initial?.domain ?? '');

  const save = useMutation({
    mutationFn: (details: CompanyDetails) =>
      companyVerificationApi.saveDetails(details),
    onSuccess: onSaved,
    onError: (err) =>
      toast.error(apiErrorMessage(err, t, 'settings.company.error')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      kind,
      legalName: legalName.trim(),
      taxId: taxId.trim(),
      domain: domain.trim() || null,
    });
  };

  return (
    <form className={card} onSubmit={submit} data-testid="company-details">
      <p className="text-sm font-semibold text-white">
        {t('settings.company.step_details')}
      </p>
      <SegmentedControl
        id="companyKind"
        label={t('settings.company.kind')}
        value={kind}
        onChange={setKind}
        items={[
          { value: 'COMPANY', label: t('settings.company.kinds.COMPANY') },
          {
            value: 'SOLE_TRADER',
            label: t('settings.company.kinds.SOLE_TRADER'),
          },
        ]}
      />
      <Input
        label={t('settings.company.legal_name')}
        value={legalName}
        onChange={(e) => setLegalName(e.target.value)}
        maxLength={200}
        required
      />
      <Input
        label={
          kind === 'COMPANY'
            ? t('settings.company.tax_id_company')
            : t('settings.company.tax_id_person')
        }
        value={taxId}
        onChange={(e) => setTaxId(e.target.value)}
        maxLength={20}
        autoCapitalize="characters"
        required
      />
      <Input
        label={
          kind === 'COMPANY'
            ? t('settings.company.domain')
            : t('settings.company.domain_optional')
        }
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="example.es"
        maxLength={253}
        inputMode="url"
        required={kind === 'COMPANY'}
      />
      <Button
        type="submit"
        variant="white"
        isLoading={save.isPending}
        className="min-h-11 self-start px-5 text-sm font-semibold"
      >
        {initial ? t('settings.company.save') : t('settings.company.start')}
      </Button>
    </form>
  );
}

function DraftSteps({
  view,
  application,
  onChange,
  onWithdraw,
  withdrawing,
}: {
  view: CompanyVerificationStatusView;
  application: CompanyApplication;
  onChange: (next: CompanyVerificationStatusView) => void;
  onWithdraw: () => void;
  withdrawing: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [localPart, setLocalPart] = useState('');
  const [code, setCode] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const failed = (err: unknown) =>
    toast.error(apiErrorMessage(err, t, 'settings.company.error'));
  const done = { onSuccess: onChange, onError: failed };

  const checkDomain = useMutation({
    mutationFn: () => companyVerificationApi.checkDomain(),
    ...done,
  });
  const sendCode = useMutation({
    mutationFn: () => companyVerificationApi.sendEmailCode(localPart.trim()),
    onSuccess: (next) => {
      onChange(next);
      toast.success(t('settings.company.code_sent'));
    },
    onError: failed,
  });
  const confirmCode = useMutation({
    mutationFn: () => companyVerificationApi.confirmEmailCode(code.trim()),
    ...done,
  });
  const addDocument = useMutation({
    mutationFn: (file: File) => companyVerificationApi.addDocument(file),
    ...done,
  });
  const removeDocument = useMutation({
    mutationFn: (id: string) => companyVerificationApi.removeDocument(id),
    ...done,
  });
  const submit = useMutation({
    mutationFn: () => companyVerificationApi.submit(),
    onSuccess: (next) => {
      onChange(next);
      toast.success(t('settings.company.sent'));
    },
    onError: failed,
  });

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success(t('settings.company.copied'));
  };

  const hasDomain = !!application.domain;
  const domainProved = !!application.domainProvedAt;
  const emailDone = !!application.emailVerifiedAt;
  const documents = application.documents;
  const ready =
    documents.length > 0 && (!hasDomain || (domainProved && emailDone));

  return (
    <div className="space-y-3" data-testid="company-draft">
      {editing ? (
        <DetailsForm
          initial={application}
          onSaved={(next) => {
            onChange(next);
            setEditing(false);
          }}
        />
      ) : (
        <div className={card}>
          <p className="text-sm font-semibold text-white">
            {t('settings.company.step_details')}
          </p>
          <div className="flex items-start gap-3">
            <Building2
              size={20}
              className="mt-0.5 shrink-0 text-white/60"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white break-words">
                {application.legalName}
              </p>
              <p className="text-xs text-white/50">
                {t(`settings.company.kinds.${application.kind}`)} ·{' '}
                {application.taxId}
                {application.domain ? ` · ${application.domain}` : ''}
              </p>
              {application.viesValid ? (
                <p className="mt-1 text-xs text-emerald-400">
                  {t('settings.company.vies_found')}
                </p>
              ) : null}
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => setEditing(true)}
            className="min-h-11 self-start px-5 text-sm font-semibold"
          >
            {t('settings.company.edit')}
          </Button>
        </div>
      )}

      {hasDomain ? (
        <div className={card} data-testid="company-domain">
          <p className="text-sm font-semibold text-white">
            {t('settings.company.step_domain', { domain: application.domain })}
          </p>
          {domainProved ? (
            <p className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 size={16} aria-hidden />
              {t('settings.company.domain_proved')}
            </p>
          ) : (
            <>
              <p className="text-xs text-white/60">
                {t('settings.company.domain_how')}
              </p>
              {[view.dnsRecord, view.metaTag].map((value, index) =>
                value ? (
                  <div key={value} className="space-y-1">
                    <p className="text-xs font-medium text-white/70">
                      {index === 0
                        ? t('settings.company.dns_record')
                        : t('settings.company.meta_tag')}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 break-all rounded-lg bg-black/40 px-3 py-2 text-xs text-white/80">
                        {value}
                      </code>
                      <button
                        type="button"
                        onClick={() => copy(value)}
                        aria-label={t('settings.company.copy')}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10"
                      >
                        <Copy size={16} aria-hidden />
                      </button>
                    </div>
                  </div>
                ) : null,
              )}
              <Button
                variant="white"
                onClick={() => checkDomain.mutate()}
                isLoading={checkDomain.isPending}
                className="min-h-11 self-start px-5 text-sm font-semibold"
              >
                {t('settings.company.check_domain')}
              </Button>
            </>
          )}
        </div>
      ) : null}

      {hasDomain && domainProved ? (
        <div className={card} data-testid="company-email">
          <p className="text-sm font-semibold text-white">
            {t('settings.company.step_email')}
          </p>
          {emailDone ? (
            <p className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 size={16} aria-hidden />
              {t('settings.company.email_confirmed', {
                address: application.emailAddress,
              })}
            </p>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    label={t('settings.company.address')}
                    value={localPart}
                    onChange={(e) => setLocalPart(e.target.value)}
                    placeholder="info"
                    maxLength={64}
                  />
                </div>
                <span className="pb-3 text-sm text-white/60 break-all">
                  @{application.domain}
                </span>
              </div>
              <Button
                variant="secondary"
                onClick={() => sendCode.mutate()}
                isLoading={sendCode.isPending}
                disabled={!localPart.trim()}
                className="min-h-11 self-start px-5 text-sm font-semibold"
              >
                {t('settings.company.send_code')}
              </Button>
              {application.emailAddress ? (
                <>
                  <Input
                    label={t('settings.company.code', {
                      address: application.emailAddress,
                    })}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                  <Button
                    variant="white"
                    onClick={() => confirmCode.mutate()}
                    isLoading={confirmCode.isPending}
                    disabled={code.trim().length !== 6}
                    className="min-h-11 self-start px-5 text-sm font-semibold"
                  >
                    {t('settings.company.confirm_code')}
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className={card} data-testid="company-documents">
        <p className="text-sm font-semibold text-white">
          {t('settings.company.step_documents')}
        </p>
        <p className="text-xs text-white/60">
          {t(`settings.company.documents_${application.kind}`)}
        </p>
        {documents.length > 0 ? (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-3"
              >
                <FileText
                  size={16}
                  className="shrink-0 text-white/60"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {doc.fileName}
                </span>
                <button
                  type="button"
                  onClick={() => removeDocument.mutate(doc.id)}
                  aria-label={t('settings.company.remove_document', {
                    name: doc.fileName,
                  })}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-white/60 hover:text-white"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          data-testid="company-document-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) addDocument.mutate(file);
          }}
        />
        {documents.length < MAX_DOCUMENTS ? (
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            isLoading={addDocument.isPending}
            className="min-h-11 self-start px-5 text-sm font-semibold"
          >
            {t('settings.company.add_document')}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => submit.mutate()}
          isLoading={submit.isPending}
          disabled={!ready}
          className="min-h-11 self-start px-5 text-sm font-semibold"
        >
          {t('settings.company.submit')}
        </Button>
        <Button
          variant="secondary"
          onClick={onWithdraw}
          isLoading={withdrawing}
          className="min-h-11 self-start px-5 text-sm font-semibold"
        >
          {t('settings.company.withdraw')}
        </Button>
      </div>
    </div>
  );
}
