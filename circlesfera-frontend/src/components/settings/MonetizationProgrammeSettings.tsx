import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MONETIZATION_PITCH_MAX,
  MONETIZATION_PITCH_MIN,
  type MonetizationProgramme,
  monetizationApi,
} from '../../services/monetization.service';
import { formatDay } from '../../utils/format';
import { reportPaymentError } from '../../utils/identityVerification';
import { Button } from '../ui';
import { BUTTON_FIT } from '../ui/buttonWidth';
import { Textarea } from '../ui/Textarea';
import SettingsSection from './SettingsSection';

// The statuses from which a Profile may apply (again).
const MAY_APPLY = new Set(['NONE', 'REJECTED', 'REVOKED']);

// The monetization programme as the creator sees it: a Profile charges only
// once CircleSfera's team approves it. It applies saying what it will
// offer, waits, and reads the answer, with the reason when it is a no.
export default function MonetizationProgrammeSettings({
  programme,
}: {
  programme: MonetizationProgramme;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [pitch, setPitch] = useState('');

  const apply = useMutation({
    mutationFn: () => monetizationApi.applyToProgramme(pitch.trim()),
    onSuccess: (data) => {
      queryClient.setQueryData(['monetization', 'programme'], data);
      setPitch('');
    },
    onError: (error: unknown) =>
      reportPaymentError(error, t, 'settings.monetization.programme.error'),
  });

  const { status, appliedAt, note } = programme;
  const statusText =
    status === 'PENDING' && appliedAt
      ? t('settings.monetization.programme.status.PENDING', {
          date: formatDay(appliedAt, i18n.language),
        })
      : t(`settings.monetization.programme.status.${status}`);
  const length = pitch.trim().length;
  const ready =
    length >= MONETIZATION_PITCH_MIN && length <= MONETIZATION_PITCH_MAX;

  return (
    <SettingsSection
      title={t('settings.monetization.programme.title')}
      description={t('settings.monetization.programme.desc')}
    >
      <div className="space-y-3 p-4">
        <p className="text-sm text-white" role="status">
          {statusText}
        </p>
        {note && (status === 'REJECTED' || status === 'REVOKED') ? (
          <p className="text-sm text-white/70">
            {t('settings.monetization.programme.reason', { reason: note })}
          </p>
        ) : null}

        {MAY_APPLY.has(status) ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) apply.mutate();
            }}
          >
            <Textarea
              label={t('settings.monetization.programme.pitch_label')}
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              maxLength={MONETIZATION_PITCH_MAX}
              rows={4}
              placeholder={t(
                'settings.monetization.programme.pitch_placeholder',
              )}
            />
            <p className="text-xs text-white/50">
              {t('settings.monetization.programme.pitch_hint', {
                min: MONETIZATION_PITCH_MIN,
                count: length,
                max: MONETIZATION_PITCH_MAX,
              })}
            </p>
            <Button
              type="submit"
              size="md"
              className={BUTTON_FIT}
              disabled={!ready}
              isLoading={apply.isPending}
            >
              {t('settings.monetization.programme.apply')}
            </Button>
          </form>
        ) : null}
      </div>
    </SettingsSection>
  );
}
