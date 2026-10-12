import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adminApi,
  type BroadcastAudience,
  type BroadcastMessage,
} from '../../services/admin.service';
import { formatDay, formatNumber } from '../../utils/format';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Input, Textarea } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { FilterDropdown, Pagination } from './AdminTable';

// The words for what narrowed a send, as the log keeps it.
const AUDIENCE_WORDS = {
  en: 'admin.newsletter.audience_en',
  es: 'admin.newsletter.audience_es',
  paying: 'admin.newsletter.audience_paying',
  free: 'admin.newsletter.audience_free',
} as const;

export default function NewsletterTab({
  onToast,
}: {
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [historyPage, setHistoryPage] = useState(1);
  const [formData, setFormData] = useState({
    subject: '',
    title: '',
    content: '',
    buttonText: '',
    buttonUrl: '',
  });
  // Who it goes to. Nothing chosen is everyone.
  const [audience, setAudience] = useState<BroadcastAudience>({});
  const narrowed = Boolean(audience.locale || audience.plan);
  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: recipients } = useQuery({
    queryKey: ['admin', 'broadcast', 'recipients', audience],
    queryFn: () =>
      adminApi.getBroadcastRecipients(audience).then((res) => res.data),
  });
  const { data: history } = useQuery({
    queryKey: ['admin', 'broadcast', 'history', historyPage],
    queryFn: () =>
      adminApi.getBroadcastHistory(historyPage, 10).then((res) => res.data),
  });
  const people =
    recipients === undefined
      ? undefined
      : formatNumber(recipients.count, i18n.language);

  // The message as the server takes it: an empty button is no button.
  const message = (): BroadcastMessage => ({
    subject: formData.subject.trim(),
    title: formData.title.trim(),
    content: formData.content,
    ...(formData.buttonText.trim() && {
      buttonText: formData.buttonText.trim(),
    }),
    ...(formData.buttonUrl.trim() && { buttonUrl: formData.buttonUrl.trim() }),
  });
  const complete = () => {
    if (formData.subject && formData.title && formData.content) return true;
    onToast(t('admin.newsletter.toast_required_fields'), 'error');
    return false;
  };

  const testMutation = useMutation({
    mutationFn: () =>
      adminApi.sendBroadcastTest(message()).then((res) => res.data),
    onSuccess: ({ sentTo }) =>
      onToast(
        t('admin.newsletter.toast_test_sent', { email: sentTo }),
        'success',
      ),
    onError: () => onToast(t('admin.newsletter.toast_test_error'), 'error'),
  });

  const handleSend = async () => {
    if (complete()) setConfirmOpen(true);
  };

  const executeSend = async () => {
    setConfirmOpen(false);
    setIsSending(true);
    try {
      await adminApi.sendBroadcast({ ...message(), ...audience });
      onToast(t('admin.newsletter.toast_sent'), 'success');
      setFormData({
        subject: '',
        title: '',
        content: '',
        buttonText: '',
        buttonUrl: '',
      });
      setHistoryPage(1);
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'broadcast', 'history'],
      });
    } catch (error) {
      console.error(error);
      onToast(t('admin.newsletter.toast_error'), 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.newsletter.title')}
        subtitle={t('admin.newsletter.subtitle')}
      />

      <div className="p-3 sm:p-4 rounded-xl border border-white/10 bg-white/5">
        <div className="flex flex-col lg:flex-row gap-2.5 sm:gap-3">
          {!showPreview && (
            <div className="flex-1 space-y-3 order-1">
              <div>
                <Input
                  id="subject"
                  label={t('admin.newsletter.label_subject')}
                  type="text"
                  placeholder={t('admin.newsletter.placeholder_subject')}
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                />
              </div>

              <div>
                <Input
                  id="title"
                  label={t('admin.newsletter.label_title')}
                  type="text"
                  placeholder={t('admin.newsletter.placeholder_title')}
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="font-semibold"
                />
              </div>

              <div>
                <Textarea
                  id="content"
                  label={t('admin.newsletter.label_content')}
                  placeholder={t('admin.newsletter.placeholder_content')}
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  className="min-h-40 sm:min-h-50 resize-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Input
                    id="buttonText"
                    label={t('admin.newsletter.label_button_text')}
                    type="text"
                    placeholder={t('admin.newsletter.placeholder_button_text')}
                    value={formData.buttonText}
                    onChange={(e) =>
                      setFormData({ ...formData, buttonText: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Input
                    id="buttonUrl"
                    label={t('admin.newsletter.label_button_url')}
                    type="text"
                    placeholder={t('admin.newsletter.placeholder_button_url')}
                    value={formData.buttonUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, buttonUrl: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {showPreview && (
            <div className="flex-1 order-2">
              <div className="bg-black border border-white/5 rounded-lg overflow-hidden max-w-2xl mx-auto shadow-2xl">
                <div className="bg-surface-elevated px-4 sm:px-6 py-3 border-b border-white/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center">
                    <span className="text-brand-primary-text font-semibold text-xs">
                      CS
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-xs font-semibold">
                      {t('admin.newsletter.preview_from')}
                    </p>
                    <p className="text-white/50 text-xs truncate">
                      {t('admin.newsletter.preview_subject', {
                        subject:
                          formData.subject ||
                          t('admin.newsletter.preview_no_subject'),
                      })}
                    </p>
                  </div>
                </div>

                <div className="p-3 sm:p-4 text-center space-y-2 sm:space-y-3 bg-black">
                  <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight leading-tight">
                    {formData.title ||
                      t('admin.newsletter.preview_default_title')}
                  </h1>
                  <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">
                    {formData.content ||
                      t('admin.newsletter.preview_default_content')}
                  </p>

                  {formData.buttonText && formData.buttonUrl && (
                    <div className="pt-4 sm:pt-6">
                      <span className="inline-block px-6 sm:px-8 py-2.5 sm:py-3 bg-white text-black font-semibold text-xs rounded-full uppercase tracking-wide shadow-xl">
                        {formData.buttonText}
                      </span>
                    </div>
                  )}

                  <div className="pt-6 sm:pt-10 border-t border-white/5">
                    <p className="text-xs text-white/50 font-semibold uppercase tracking-wide">
                      {t('admin.newsletter.preview_footer')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        <FilterDropdown
          fluid
          visibleLabel
          label={t('admin.newsletter.audience_language')}
          value={audience.locale ?? ''}
          onChange={(v) =>
            setAudience(({ locale: _locale, ...rest }) => ({
              ...rest,
              ...(v && { locale: v as BroadcastAudience['locale'] }),
            }))
          }
          options={[
            { value: '', label: t('admin.newsletter.audience_any_language') },
            { value: 'en', label: t('admin.newsletter.audience_en') },
            { value: 'es', label: t('admin.newsletter.audience_es') },
          ]}
        />
        <FilterDropdown
          fluid
          visibleLabel
          label={t('admin.newsletter.audience_plan')}
          value={audience.plan ?? ''}
          onChange={(v) =>
            setAudience(({ plan: _plan, ...rest }) => ({
              ...rest,
              ...(v && { plan: v as BroadcastAudience['plan'] }),
            }))
          }
          options={[
            { value: '', label: t('admin.newsletter.audience_any_plan') },
            { value: 'paying', label: t('admin.newsletter.audience_paying') },
            { value: 'free', label: t('admin.newsletter.audience_free') },
          ]}
        />
      </div>

      {/* What is about to happen, said with its number. */}
      <p className="text-sm text-white/70">
        {people === undefined
          ? t('admin.newsletter.reach_unknown')
          : t('admin.newsletter.reach', {
              count: recipients?.count ?? 0,
              people,
            })}
      </p>

      <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowPreview(!showPreview)}
          className="min-h-11 text-sm w-full sm:w-auto"
        >
          {showPreview
            ? t('admin.newsletter.edit_content')
            : t('admin.newsletter.preview')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (complete()) testMutation.mutate();
          }}
          disabled={testMutation.isPending || isSending}
          isLoading={testMutation.isPending}
          className="min-h-11 text-sm w-full sm:w-auto"
        >
          <Mail size={16} className="mr-2" />
          {t('admin.newsletter.send_test')}
        </Button>
        <Button
          onClick={handleSend}
          disabled={isSending}
          className="min-h-11 text-sm w-full sm:w-auto"
        >
          {isSending ? (
            <>
              <CheckCircle2 size={16} className="mr-2" />
              {t('admin.newsletter.sending')}
            </>
          ) : (
            <>
              <Send size={16} className="mr-2" />
              {narrowed
                ? t('admin.newsletter.send_audience')
                : t('admin.newsletter.send_broadcast')}
            </>
          )}
        </Button>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={executeSend}
        title={t('admin.newsletter.confirm_title')}
        message={
          people === undefined
            ? t('admin.newsletter.confirm_message')
            : t('admin.newsletter.confirm_message_count', {
                count: recipients?.count ?? 0,
                people,
              })
        }
        confirmText={t('admin.newsletter.confirm_send')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={false}
      />

      <section className="space-y-2 pt-2">
        <h3 className="text-sm sm:text-base font-semibold text-white">
          {t('admin.newsletter.history_title')}
        </h3>
        {history && history.data.length === 0 ? (
          <AdminEmptyState
            title={t('admin.newsletter.history_empty')}
            compact
          />
        ) : (
          <div className="space-y-2">
            {history?.data.map((send) => (
              <AdminListRow
                key={send.id}
                title={send.subject || t('admin.newsletter.preview_no_subject')}
                subtitle={
                  send.sent === null
                    ? undefined
                    : t('admin.newsletter.history_counts', {
                        sent: formatNumber(send.sent, i18n.language),
                        failed: formatNumber(send.failed ?? 0, i18n.language),
                      })
                }
                meta={
                  <>
                    <span>{formatDay(send.createdAt, i18n.language)}</span>
                    {send.sentBy && <span>{send.sentBy}</span>}
                    {send.audience
                      .filter((part) => part in AUDIENCE_WORDS)
                      .map((part) => (
                        <span key={part}>
                          {t(
                            AUDIENCE_WORDS[part as keyof typeof AUDIENCE_WORDS],
                          )}
                        </span>
                      ))}
                  </>
                }
              />
            ))}
          </div>
        )}
        <Pagination meta={history?.meta} onPageChange={setHistoryPage} />
      </section>
    </div>
  );
}
