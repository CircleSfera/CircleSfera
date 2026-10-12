import { AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../services/admin.service';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Input, Textarea } from '../ui';
import { AdminPageHeader } from './AdminPageHeader';

export default function NewsletterTab({
  onToast,
}: {
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    subject: '',
    title: '',
    content: '',
    buttonText: '',
    buttonUrl: '',
  });
  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSend = async () => {
    if (!formData.subject || !formData.title || !formData.content) {
      onToast(t('admin.newsletter.toast_required_fields'), 'error');
      return;
    }

    setConfirmOpen(true);
  };

  const executeSend = async () => {
    setConfirmOpen(false);
    setIsSending(true);
    try {
      await adminApi.sendBroadcast(formData);
      onToast(t('admin.newsletter.toast_sent'), 'success');
      setFormData({
        subject: '',
        title: '',
        content: '',
        buttonText: '',
        buttonUrl: '',
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

      <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="text-orange-500 shrink-0 mt-0.5" size={18} />
        <div>
          <h4 className="text-orange-500 text-xs font-semibold uppercase tracking-wide mb-1">
            {t('admin.newsletter.security_title')}
          </h4>
          <p className="text-white/70 text-xs leading-relaxed">
            {t('admin.newsletter.security_description')}
          </p>
        </div>
      </div>

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
              {t('admin.newsletter.send_broadcast')}
            </>
          )}
        </Button>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={executeSend}
        title={t('admin.newsletter.confirm_title')}
        message={t('admin.newsletter.confirm_message')}
        confirmText={t('admin.newsletter.confirm_send')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={false}
      />
    </div>
  );
}
