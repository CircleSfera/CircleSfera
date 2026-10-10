import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supportApi } from '../../services/support.service';
import { formatDate } from '../../utils/format';
import { RequestStatus } from './RequestStatus';

/**
 * The requests the signed-in person has written to support, the one with
 * the latest change first. Shows nothing while there are none.
 */
export function MyRequests() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ['support', 'my-requests'],
    queryFn: () => supportApi.myRequests().then((res) => res.data),
  });

  if (!data || data.data.length === 0) return null;

  return (
    <section aria-labelledby="my-requests" className="mt-10 sm:mt-14">
      <h2
        id="my-requests"
        className="text-xl font-black tracking-tight text-white sm:text-2xl"
      >
        {t('supportPage.requests.title')}
      </h2>
      <ul className="mt-4 space-y-2">
        {data.data.map((request) => (
          <li key={request.id}>
            <Link
              to={`/support/requests/${request.id}`}
              className="glass-panel flex min-h-16 items-center gap-3 rounded-2xl p-4 transition-colors hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-white">
                  {request.subject}
                </span>
                <span className="mt-0.5 block text-sm text-white/60">
                  #{request.reference} ·{' '}
                  {formatDate(request.updatedAt, i18n.language)}
                </span>
              </span>
              <RequestStatus status={request.status} />
              <ChevronRight
                size={18}
                aria-hidden="true"
                className="shrink-0 text-white/40"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
