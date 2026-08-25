import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  type Appeal,
  type AppealTargetType,
  createAppeal,
  getMyAppeals,
} from '../../services/appeals.service';
import { LoadingSpinner } from '../LoadingStates';
import { Button, Select, Textarea } from '../ui';
import SettingsSection from './SettingsSection';

const FIELD_LABEL = 'block text-sm font-medium text-white mb-1.5';

export default function AppealsSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [targetType, setTargetType] =
    useState<AppealTargetType>('POST_REMOVAL');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');

  const { data: appeals, isLoading } = useQuery({
    queryKey: ['myAppeals'],
    queryFn: getMyAppeals,
  });

  const createMutation = useMutation({
    mutationFn: createAppeal,
    onSuccess: () => {
      toast.success(t('settings.appeals.created'));
      setTargetId('');
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['myAppeals'] });
    },
    onError: () => {
      toast.error(t('settings.appeals.error'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error(t('settings.appeals.reason_required'));
      return;
    }
    createMutation.mutate({
      targetType,
      targetId: targetId.trim() || undefined,
      reason: reason.trim(),
    });
  };

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.appeals.title')}
        description={t('settings.appeals.subtitle')}
        card={false}
      >
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-4"
        >
          <h3 className="text-sm font-medium text-white">
            {t('settings.appeals.create_title')}
          </h3>

          <div>
            <label htmlFor="appeal-target-type" className={FIELD_LABEL}>
              {t('settings.appeals.type')}
            </label>
            <Select
              id="appeal-target-type"
              value={targetType}
              onChange={(e) =>
                setTargetType(e.target.value as AppealTargetType)
              }
            >
              <option value="POST_REMOVAL">
                {t('settings.appeals.type_post')}
              </option>
              <option value="ACCOUNT_BAN">
                {t('settings.appeals.type_ban')}
              </option>
              <option value="BOT_LABEL">
                {t('settings.appeals.type_bot_label', 'Possible bot label')}
              </option>
            </Select>
          </div>

          <div>
            <label htmlFor="appeal-target-id" className={FIELD_LABEL}>
              {t('settings.appeals.target_id')}
            </label>
            <input
              id="appeal-target-id"
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={t('settings.appeals.target_id_placeholder')}
              className="w-full min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            />
          </div>

          <div>
            <div className="flex justify-between items-baseline gap-3 mb-1.5">
              <label
                htmlFor="appeal-reason"
                className="text-sm font-medium text-white"
              >
                {t('settings.appeals.reason')}
              </label>
              <span
                className={`text-xs ${reason.length >= 450 ? 'text-brand-secondary' : 'text-white/40'}`}
              >
                {reason.length}/500
              </span>
            </div>
            <Textarea
              id="appeal-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder={t('settings.appeals.reason_placeholder')}
              className="resize-none"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!reason.trim()}
            isLoading={createMutation.isPending}
            className="w-full"
          >
            {t('settings.appeals.submit')}
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection title={t('settings.appeals.list_title')} card={false}>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner size="sm" />
          </div>
        ) : appeals && appeals.length > 0 ? (
          <ul className="space-y-3">
            {appeals.map((appeal) => (
              <AppealRow key={appeal.id} appeal={appeal} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/50 text-center py-8 rounded-xl border border-white/5 bg-white/[0.02]">
            {t('settings.appeals.empty')}
          </p>
        )}
      </SettingsSection>
    </div>
  );
}

function AppealRow({ appeal }: { appeal: Appeal }) {
  const { t } = useTranslation();
  const statusLabel =
    appeal.status === 'PENDING'
      ? t('settings.appeals.status_pending')
      : appeal.status === 'APPROVED'
        ? t('settings.appeals.status_approved')
        : t('settings.appeals.status_rejected');
  const statusClass =
    appeal.status === 'PENDING'
      ? 'text-brand-accent bg-brand-accent/10 border-brand-accent/20'
      : appeal.status === 'APPROVED'
        ? 'text-white bg-white/10 border-white/15'
        : 'text-brand-secondary bg-brand-secondary/10 border-brand-secondary/20';
  const StatusIcon =
    appeal.status === 'PENDING'
      ? Clock
      : appeal.status === 'APPROVED'
        ? CheckCircle
        : XCircle;
  const typeLabel =
    appeal.targetType === 'ACCOUNT_BAN'
      ? t('settings.appeals.type_ban')
      : appeal.targetType === 'BOT_LABEL'
        ? t('settings.appeals.type_bot_label', 'Possible bot label')
        : t('settings.appeals.type_post');

  return (
    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{typeLabel}</p>
          {appeal.targetId ? (
            <p className="text-xs text-white/40 font-mono mt-0.5">
              #{appeal.targetId.slice(0, 8)}
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium shrink-0 ${statusClass}`}
        >
          <StatusIcon size={12} aria-hidden />
          {statusLabel}
        </span>
      </div>
      <p className="text-sm text-white/70 leading-relaxed line-clamp-3">
        {appeal.reason}
      </p>
      {appeal.adminNotes ? (
        <div className="p-2.5 rounded-lg bg-brand-primary/10 border border-brand-primary/15">
          <p className="text-xs font-medium text-brand-primary mb-1">
            {t('settings.appeals.admin_notes')}
          </p>
          <p className="text-xs text-white/60">{appeal.adminNotes}</p>
        </div>
      ) : null}
      <p className="text-xs text-white/40">
        {new Date(appeal.createdAt).toLocaleDateString()}
      </p>
    </li>
  );
}
