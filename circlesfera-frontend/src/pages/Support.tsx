import { ArrowRight, Fingerprint, HelpCircle, Scale } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import SEO from '../components/common/SEO';
import {
  MarketingCTA,
  MarketingPage,
  MarketingPageHeader,
} from '../components/marketing';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { apiErrorMessage } from '../utils/apiErrorMessage';

const SHORTCUTS = [
  { key: 'faq', to: '/faq', icon: HelpCircle },
  { key: 'rules', to: '/guidelines', icon: Scale },
  { key: 'privacy', to: '/privacy', icon: Fingerprint },
] as const;

const STEPS = ['s1', 's2', 's3'] as const;

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
      // The API client rejects with { status, data }, never an Axios error.
      setErrorMessage(apiErrorMessage(error, t, 'supportPage.error_generic'));
    }
  };

  return (
    <MarketingPage>
      <SEO
        title={t('supportPage.seo_title')}
        description={t('supportPage.seo_desc')}
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
        <MarketingPageHeader
          className="pt-12 pb-8 sm:pt-20 sm:pb-12"
          align="center"
          eyebrow={t('supportPage.badge')}
          title={t('supportPage.title')}
          description={t('supportPage.description')}
        />

        {/* The answer may already be written down */}
        <ul className="grid gap-4 md:grid-cols-3">
          {SHORTCUTS.map(({ key, to, icon: Icon }) => (
            <li key={key}>
              <Link
                to={to}
                className="group flex h-full items-start gap-4 rounded-3xl glass-panel p-6 transition-colors hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
                  <Icon size={22} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold tracking-tight text-white">
                    {t(`supportPage.help.${key}_title`)}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-white/60">
                    {t(`supportPage.help.${key}_desc`)}
                  </span>
                </span>
                <ArrowRight
                  size={18}
                  className="mt-1 shrink-0 text-white/30 transition-colors group-hover:text-brand-primary"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 grid gap-8 sm:mt-14 lg:grid-cols-[1fr_1.2fr] lg:gap-12">
          <section>
            <h2 className="text-3xl font-black leading-[1.08] tracking-tight text-white sm:text-4xl">
              {t('supportPage.steps_title')}
            </h2>
            <ol className="mt-8 space-y-6">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-sm font-black text-brand-primary">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-white">
                      {t(`supportPage.steps.${step}_title`)}
                    </h3>
                    <p className="mt-1 text-base leading-relaxed text-white/60">
                      {t(`supportPage.steps.${step}_desc`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="rounded-3xl glass-panel p-5 sm:p-8">
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              {t('supportPage.write_title')}
            </h2>
            <p className="mt-2 mb-6 text-base leading-relaxed text-white/65">
              {t('supportPage.write_desc')}
            </p>
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
                  <div className="rounded-3xl border border-brand-primary/30 bg-brand-primary/10 p-5 text-sm text-white/85 space-y-4">
                    <p>{t('supportPage.login_required')}</p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <MarketingCTA
                        to="/accounts/login"
                        variant="primary"
                        className="px-8"
                      >
                        {t('common.footer.login')}
                      </MarketingCTA>
                      <MarketingCTA
                        to="/accounts/signup"
                        variant="secondary"
                        size="lg"
                        className="px-8"
                      >
                        {t('common.footer.signup')}
                      </MarketingCTA>
                    </div>
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

                {/* Without a session the way forward is the notice above, not
                    a send button that cannot be pressed. */}
                {userEmail && (
                  <MarketingCTA
                    type="submit"
                    variant="primary"
                    className="w-full"
                    disabled={status === 'loading'}
                  >
                    {status === 'loading'
                      ? t('supportPage.submitting')
                      : t('supportPage.submit')}
                  </MarketingCTA>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </MarketingPage>
  );
};
