import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import SEO from '../components/common/SEO';
import { MarketingCTA, MarketingPage } from '../components/marketing';
import { RequestStatus } from '../components/support/RequestStatus';
import { Textarea } from '../components/ui/Textarea';
import {
  type SupportRequestDetail,
  supportApi,
} from '../services/support.service';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import { formatDateTime } from '../utils/format';

const MAX_LENGTH = 5000;

/**
 * One request to support, for the person who wrote it: the conversation
 * with the team and the box to reply. Internal notes of the team never reach
 * this page; the server leaves them out.
 */
export function SupportRequest() {
  const { id = '' } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [reply, setReply] = useState('');

  const {
    data: request,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['support', 'my-request', id],
    queryFn: () => supportApi.myRequest(id).then((res) => res.data),
    enabled: !!id,
    retry: false,
  });

  const replyMutation = useMutation({
    mutationFn: () => supportApi.reply(id, reply.trim()),
    onSuccess: (res) => {
      setReply('');
      queryClient.setQueryData<SupportRequestDetail>(
        ['support', 'my-request', res.data.id],
        res.data,
      );
      queryClient.invalidateQueries({ queryKey: ['support', 'my-requests'] });
      // A reply to a closed request opened a new one: go to it.
      if (res.data.id !== id) {
        navigate(`/support/requests/${res.data.id}`);
      }
    },
  });

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (reply.trim()) replyMutation.mutate();
  };

  return (
    <MarketingPage>
      <SEO
        title={t('supportPage.requests.seo_title')}
        description={t('supportPage.seo_desc')}
      />
      <div className="mx-auto w-full max-w-2xl px-4 pb-14 pt-6 sm:px-6 sm:pb-20 sm:pt-10">
        <Link
          to="/support"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          {t('supportPage.requests.back')}
        </Link>

        {isLoading && (
          <p className="mt-6 text-base text-white/60" role="status">
            {t('common.loading')}
          </p>
        )}

        {isError && (
          <p className="mt-6 text-base text-white/80" role="alert">
            {t('supportPage.requests.not_found')}
          </p>
        )}

        {request && (
          <>
            <header className="mt-4">
              <div className="flex items-start justify-between gap-3">
                <h1 className="min-w-0 text-2xl font-black leading-tight tracking-tight text-white wrap-break-word sm:text-3xl">
                  {request.subject}
                </h1>
                <RequestStatus status={request.status} />
              </div>
              <p className="mt-2 text-sm text-white/60">
                #{request.reference} ·{' '}
                {t(`supportPage.category.${request.category}`)}
              </p>
              {request.previousTicketId && (
                <Link
                  to={`/support/requests/${request.previousTicketId}`}
                  className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-white/80 underline underline-offset-2 hover:text-white"
                >
                  {t('supportPage.requests.continues')}
                </Link>
              )}
            </header>

            <ol
              aria-label={t('supportPage.requests.conversation')}
              className="mt-6 space-y-3"
            >
              {request.messages.map((message) => {
                const mine = message.authorKind === 'REQUESTER';
                return (
                  <li
                    key={message.id}
                    className={`rounded-2xl border p-4 ${
                      mine
                        ? 'ml-6 border-white/10 bg-white/5'
                        : 'mr-6 border-brand-primary/30 bg-brand-primary/10'
                    }`}
                  >
                    <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-white/60">
                      <span className="font-semibold text-white/85">
                        {t(
                          mine
                            ? 'supportPage.requests.you'
                            : 'supportPage.requests.team',
                        )}
                      </span>
                      <span>
                        {formatDateTime(message.createdAt, i18n.language)}
                      </span>
                    </p>
                    <p className="text-base leading-relaxed text-white/85 whitespace-pre-wrap wrap-break-word">
                      {message.body}
                    </p>
                  </li>
                );
              })}
            </ol>

            {request.status === 'CLOSED' && (
              <p className="mt-6 rounded-2xl glass-panel p-4 text-base text-white/70">
                {t('supportPage.requests.closed_notice')}
              </p>
            )}
            <form onSubmit={send} className="mt-6 space-y-3">
              <Textarea
                id="reply"
                label={t(
                  request.status === 'CLOSED'
                    ? 'supportPage.requests.write_again'
                    : 'supportPage.requests.reply_label',
                )}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t('supportPage.requests.reply_placeholder')}
                rows={4}
                maxLength={MAX_LENGTH}
                disabled={replyMutation.isPending}
                className="min-h-28"
              />
              {request.status === 'RESOLVED' && (
                <p className="text-sm text-white/60">
                  {t('supportPage.requests.reopen_hint')}
                </p>
              )}
              {replyMutation.isError && (
                <p className="text-sm text-brand-secondary" role="alert">
                  {apiErrorMessage(
                    replyMutation.error,
                    t,
                    'supportPage.error_generic',
                  )}
                </p>
              )}
              <MarketingCTA
                type="submit"
                variant="primary"
                className="w-full sm:w-auto"
                disabled={!reply.trim() || replyMutation.isPending}
              >
                {replyMutation.isPending
                  ? t('supportPage.submitting')
                  : t('supportPage.requests.send')}
              </MarketingCTA>
            </form>
          </>
        )}
      </div>
    </MarketingPage>
  );
}
