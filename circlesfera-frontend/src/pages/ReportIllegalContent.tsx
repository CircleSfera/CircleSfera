import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TurnstileWidget from '../components/auth/TurnstileWidget';
import SEO from '../components/common/SEO';
import { MarketingPage } from '../components/marketing';
import { Button, Input } from '../components/ui';
import { BUTTON_FIT, BUTTON_ROW } from '../components/ui/buttonWidth';
import { Textarea } from '../components/ui/Textarea';
import { illegalNoticesApi } from '../services/illegalNotices.service';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import { toAppLocale } from '../utils/appLocale';

/**
 * Anyone, with or without an account, can tell CircleSfera about illegal
 * content (Digital Services Act Art. 16): where it is, why it is illegal,
 * who they are (not needed for child sexual abuse material) and that they
 * write in good faith. The reference of the notice is shown at the end and
 * sent by email; the decision follows by email too.
 */
export default function ReportIllegalContent() {
  const { t, i18n } = useTranslation();
  const [contentUrl, setContentUrl] = useState('');
  const [explanation, setExplanation] = useState('');
  const [childAbuse, setChildAbuse] = useState(false);
  const [notifierName, setNotifierName] = useState('');
  const [notifierEmail, setNotifierEmail] = useState('');
  const [goodFaith, setGoodFaith] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const onCaptchaToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

  const send = useMutation({
    mutationFn: () =>
      illegalNoticesApi.create({
        contentUrl: contentUrl.trim(),
        explanation: explanation.trim(),
        childAbuse,
        notifierName: notifierName.trim() || undefined,
        notifierEmail: notifierEmail.trim() || undefined,
        goodFaith: true,
        locale: toAppLocale(i18n.resolvedLanguage ?? i18n.language),
        captchaToken: captchaToken || undefined,
      }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (goodFaith) send.mutate();
  };

  return (
    <MarketingPage>
      <SEO
        title={t('illegalNotice.seo_title')}
        description={t('illegalNotice.intro')}
      />
      <div className="mx-auto w-full max-w-2xl px-4 pb-14 pt-6 sm:px-6 sm:pb-20 sm:pt-10">
        <h1 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
          {t('illegalNotice.title')}
        </h1>
        <p className="mt-2 text-base text-white/70">
          {t('illegalNotice.intro')}
        </p>

        {send.isSuccess ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-base font-semibold text-white" role="status">
              {t('illegalNotice.sent', {
                reference: send.data.data.reference,
              })}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {notifierEmail.trim()
                ? t('illegalNotice.sent_email')
                : t('illegalNotice.sent_no_email')}
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Input
              label={t('illegalNotice.url_label')}
              type="url"
              inputMode="url"
              required
              value={contentUrl}
              onChange={(e) => setContentUrl(e.target.value)}
              placeholder="https://circlesfera.com/p/…"
            />
            <Textarea
              label={t('illegalNotice.explanation_label')}
              required
              minLength={20}
              maxLength={5000}
              rows={6}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder={t('illegalNotice.explanation_placeholder')}
            />
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={childAbuse}
                onChange={(e) => setChildAbuse(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand-primary"
              />
              <span>{t('illegalNotice.child_abuse')}</span>
            </label>
            <Input
              label={
                childAbuse
                  ? `${t('illegalNotice.name_label')} ${t('illegalNotice.optional')}`
                  : t('illegalNotice.name_label')
              }
              required={!childAbuse}
              autoComplete="name"
              value={notifierName}
              onChange={(e) => setNotifierName(e.target.value)}
            />
            <Input
              label={
                childAbuse
                  ? `${t('illegalNotice.email_label')} ${t('illegalNotice.optional')}`
                  : t('illegalNotice.email_label')
              }
              type="email"
              required={!childAbuse}
              autoComplete="email"
              value={notifierEmail}
              onChange={(e) => setNotifierEmail(e.target.value)}
            />
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={goodFaith}
                onChange={(e) => setGoodFaith(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand-primary"
              />
              <span>{t('illegalNotice.good_faith')}</span>
            </label>

            <TurnstileWidget onToken={onCaptchaToken} />

            {send.isError && (
              <p className="text-sm text-brand-secondary" role="alert">
                {apiErrorMessage(send.error, t, 'illegalNotice.error')}
              </p>
            )}

            <div className={BUTTON_ROW}>
              <Button
                type="submit"
                variant="primary"
                disabled={!goodFaith || send.isPending}
                isLoading={send.isPending}
                className={BUTTON_FIT}
              >
                {t('illegalNotice.send')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </MarketingPage>
  );
}
