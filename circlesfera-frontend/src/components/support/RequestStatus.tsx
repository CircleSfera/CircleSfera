import { useTranslation } from 'react-i18next';
import type { SupportRequestStatus } from '../../services/support.service';

const LOOK: Record<SupportRequestStatus, string> = {
  OPEN: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400',
  ESCALATED: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400',
  WAITING: 'border-brand-primary/40 bg-brand-primary/15 text-white',
  RESOLVED: 'border-green-400/30 bg-green-400/10 text-green-400',
  CLOSED: 'border-white/20 bg-white/10 text-white/70',
};

/** The state of a request, in the words the person who wrote it reads. */
export function RequestStatus({ status }: { status: SupportRequestStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-bold ${LOOK[status]}`}
    >
      {t(`supportPage.requests.status.${status}`)}
    </span>
  );
}
