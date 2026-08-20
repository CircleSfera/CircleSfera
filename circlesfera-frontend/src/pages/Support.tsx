import axios from 'axios';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  MarketingCTA,
  MarketingPage,
  MarketingPageHeader,
} from '../components/marketing';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export const Support = () => {
  const { t } = useTranslation();
  const profile = useAuthStore((state) => state.profile);
  const userEmail = profile?.user?.email || '';
  const userId = profile?.userId || profile?.user?.id;
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      await apiClient.post('/support/tickets', {
        email: userEmail,
        subject,
        message,
        userId: userId,
      });
      setStatus('success');
      setSubject('');
      setMessage('');
    } catch (error: unknown) {
      setStatus('error');
      if (axios.isAxiosError(error)) {
        setErrorMessage(
          error.response?.data?.message || t('supportPage.error_generic'),
        );
      } else {
        setErrorMessage(t('supportPage.error_generic'));
      }
    }
  };

  return (
    <MarketingPage atmosphere>
      <div className="mx-auto max-w-2xl px-4 sm:px-5 py-10 sm:py-14 w-full">
        <MarketingPageHeader
          className="mb-8 sm:mb-10"
          eyebrow={t('supportPage.badge', 'Support')}
          title={t('supportPage.title')}
          description={t('supportPage.description')}
        />

        <div className="glass-panel rounded-xl p-5 sm:p-7">
          {status === 'success' ? (
            <div
              className="rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-4 text-sm text-white/85"
              role="status"
            >
              <p className="font-semibold mb-1 text-white">
                {t('supportPage.success_title')}
              </p>
              <p className="text-white/60">
                {t('supportPage.success_body', { email: userEmail })}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {!userEmail && (
                <div className="rounded-xl border border-brand-accent/30 bg-brand-accent/10 p-4 text-sm text-white/85 space-y-3">
                  <p>{t('supportPage.login_required')}</p>
                  <MarketingCTA to="/accounts/login" variant="secondary">
                    {t('common.footer.login')}
                  </MarketingCTA>
                </div>
              )}

              <Input
                id="subject"
                label={t('supportPage.subject_label')}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('supportPage.subject_placeholder')}
                required
                disabled={!userEmail || status === 'loading'}
              />

              <Textarea
                id="message"
                label={t('supportPage.message_label')}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('supportPage.message_placeholder')}
                required
                disabled={!userEmail || status === 'loading'}
                className="min-h-32"
              />

              {status === 'error' && (
                <p className="text-sm text-brand-secondary" role="alert">
                  {errorMessage}
                </p>
              )}

              <MarketingCTA
                type="submit"
                variant="primary"
                className="w-full"
                disabled={!userEmail || status === 'loading'}
              >
                {status === 'loading'
                  ? t('supportPage.submitting')
                  : t('supportPage.submit')}
              </MarketingCTA>

              {!userEmail && (
                <p className="text-xs text-white/40 text-center">
                  <Link
                    to="/accounts/emailsignup"
                    className="text-brand-primary hover:underline"
                  >
                    {t('common.footer.signup')}
                  </Link>
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </MarketingPage>
  );
};
