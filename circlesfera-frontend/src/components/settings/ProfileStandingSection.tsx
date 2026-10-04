import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getMyStrikes,
  type ProfileStrike,
} from '../../services/appeals.service';
import { LoadingSpinner } from '../LoadingStates';
import SettingsSection from './SettingsSection';

interface ProfileStandingSectionProps {
  // Opens the appeal form for one warning or strike.
  onAppeal: (strikeId: string) => void;
  // Records that already have a pending appeal.
  pendingAppealIds: Set<string>;
}

// Warnings and strikes of the Profile the session acts as, with their state
// and an appeal action for the ones that still count.
export default function ProfileStandingSection({
  onAppeal,
  pendingAppealIds,
}: ProfileStandingSectionProps) {
  const { t } = useTranslation();
  const {
    data: strikes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['myStrikes'],
    queryFn: getMyStrikes,
  });

  const activeStrikes =
    strikes?.filter((s) => s.kind === 'STRIKE' && s.status === 'ACTIVE')
      .length ?? 0;

  return (
    <SettingsSection
      title={t('settings.appeals.strikes_title')}
      description={t('settings.appeals.strikes_subtitle')}
      card={false}
    >
      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="sm" />
        </div>
      ) : isError ? (
        <p className="text-sm text-white/50 text-center py-6 rounded-xl border border-white/5 bg-white/[0.02]">
          {t('settings.appeals.strikes_error')}
        </p>
      ) : strikes && strikes.length > 0 ? (
        <div className="space-y-3">
          <p
            className="text-sm font-medium text-white"
            data-testid="active-strike-count"
          >
            {t('settings.appeals.strikes_active_count', {
              count: activeStrikes,
            })}
          </p>
          <ul className="space-y-3">
            {strikes.map((strike) => (
              <StrikeRow
                key={strike.id}
                strike={strike}
                appealPending={pendingAppealIds.has(strike.id)}
                onAppeal={onAppeal}
              />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-white/50 text-center py-6 rounded-xl border border-white/5 bg-white/[0.02]">
          {t('settings.appeals.strikes_empty')}
        </p>
      )}
    </SettingsSection>
  );
}

function StrikeRow({
  strike,
  appealPending,
  onAppeal,
}: {
  strike: ProfileStrike;
  appealPending: boolean;
  onAppeal: (strikeId: string) => void;
}) {
  const { t } = useTranslation();
  const isWarning = strike.kind === 'WARNING';
  const Icon = isWarning ? AlertTriangle : ShieldAlert;
  const statusLabel =
    strike.status === 'ACTIVE'
      ? t('settings.appeals.strike_status_active')
      : strike.status === 'EXPIRED'
        ? t('settings.appeals.strike_status_expired')
        : t('settings.appeals.strike_status_revoked');
  const statusClass =
    strike.status === 'ACTIVE'
      ? 'text-brand-secondary bg-brand-secondary/10 border-brand-secondary/20'
      : 'text-white/60 bg-white/5 border-white/10';
  const consequence =
    strike.consequence === 'BANNED'
      ? t('settings.appeals.strike_consequence_banned')
      : strike.consequence === 'SUSPENDED'
        ? t('settings.appeals.strike_consequence_suspended')
        : null;
  const expiry = new Date(strike.expiresAt).toLocaleDateString();

  return (
    <li
      className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2"
      data-testid="strike-row"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon
            size={16}
            className={`mt-0.5 shrink-0 ${isWarning ? 'text-amber-400' : 'text-brand-secondary'}`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">
              {isWarning
                ? t('settings.appeals.strike_kind_warning')
                : t('settings.appeals.strike_kind_strike')}
              {' · '}
              {t(`settings.appeals.strike_reason.${strike.reason}`)}
            </p>
            {consequence ? (
              <p className="text-xs text-white/60 mt-0.5">{consequence}</p>
            ) : null}
          </div>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium shrink-0 ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="text-xs text-white/40">
        {t('settings.appeals.strike_applied_on', {
          date: new Date(strike.createdAt).toLocaleDateString(),
        })}
        {strike.status !== 'REVOKED' ? (
          <>
            {' · '}
            {strike.status === 'ACTIVE'
              ? t('settings.appeals.strike_expires_on', { date: expiry })
              : t('settings.appeals.strike_expired_on', { date: expiry })}
          </>
        ) : null}
      </p>
      {strike.status === 'ACTIVE' ? (
        appealPending ? (
          <p className="text-xs text-brand-accent">
            {t('settings.appeals.status_pending')}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => onAppeal(strike.id)}
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/5 px-4 text-xs font-semibold text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
          >
            {t('settings.appeals.strike_appeal')}
          </button>
        )
      ) : null}
    </li>
  );
}
