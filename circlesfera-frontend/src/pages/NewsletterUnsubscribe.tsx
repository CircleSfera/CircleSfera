import { useMutation } from '@tanstack/react-query';
import { CheckCircle, MailX, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui';
import { BUTTON_FIT, BUTTON_ROW } from '../components/ui/buttonWidth';
import LayoutWrapper from '../layouts/LayoutWrapper';
import { authApi } from '../services';

/**
 * Leaves the newsletter from the link in one of them, without signing in.
 * It waits for the person to press the button: a mail scanner that opens the
 * link must not unsubscribe anyone.
 */
export default function NewsletterUnsubscribe() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const unsubscribe = useMutation({
    mutationFn: () => authApi.unsubscribeNewsletter(token ?? ''),
  });

  const failed = !token || unsubscribe.isError;

  return (
    <LayoutWrapper showNavigation={false}>
      <div className="min-h-dvh flex items-center justify-center p-4 relative z-10">
        <div className="modal-glass w-full max-w-md rounded-4xl p-8 text-center">
          {unsubscribe.isSuccess ? (
            <>
              <CheckCircle
                className="mx-auto mb-4 h-14 w-14 text-green-400"
                strokeWidth={1.5}
                aria-hidden
              />
              <h1 className="mb-2 text-2xl font-black tracking-tight text-white">
                {t('newsletter.unsubscribe.done_title')}
              </h1>
              <p className="text-sm text-gray-300">
                {t('newsletter.unsubscribe.done_body')}
              </p>
            </>
          ) : failed ? (
            <>
              <XCircle
                className="mx-auto mb-4 h-14 w-14 text-brand-secondary"
                strokeWidth={1.5}
                aria-hidden
              />
              <h1 className="mb-2 text-2xl font-black tracking-tight text-white">
                {t('newsletter.unsubscribe.title')}
              </h1>
              <p className="text-sm text-gray-300" role="alert">
                {t('newsletter.unsubscribe.error')}
              </p>
            </>
          ) : (
            <>
              <MailX
                className="mx-auto mb-4 h-14 w-14 text-brand-primary-text"
                strokeWidth={1.5}
                aria-hidden
              />
              <h1 className="mb-2 text-2xl font-black tracking-tight text-white">
                {t('newsletter.unsubscribe.title')}
              </h1>
              <p className="mb-6 text-sm text-gray-300">
                {t('newsletter.unsubscribe.body')}
              </p>
              <div className={BUTTON_ROW}>
                <Button
                  type="button"
                  variant="primary"
                  isLoading={unsubscribe.isPending}
                  disabled={unsubscribe.isPending}
                  onClick={() => unsubscribe.mutate()}
                  className={BUTTON_FIT}
                >
                  {t('newsletter.unsubscribe.button')}
                </Button>
              </div>
            </>
          )}
          <Link
            to="/"
            className="mt-6 inline-flex min-h-11 items-center justify-center text-sm font-bold text-brand-primary-text hover:underline"
          >
            {t('newsletter.unsubscribe.home')}
          </Link>
        </div>
      </div>
    </LayoutWrapper>
  );
}
