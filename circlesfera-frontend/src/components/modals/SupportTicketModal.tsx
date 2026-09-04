import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Send,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, uploadApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { pickNativeImage } from '../../utils/nativeFilePicker';
import { Dialog } from '../ui/Dialog';

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUPPORT_CATEGORIES = [
  'TECHNICAL',
  'BILLING',
  'ACCOUNT',
  'SUGGESTION',
] as const;

export default function SupportTicketModal({
  isOpen,
  onClose,
}: SupportTicketModalProps) {
  const { t } = useTranslation();
  const profile = useAuthStore((state) => state.profile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState(profile?.user?.email || '');
  const [subject, setSubject] = useState('');
  const [category, setCategory] =
    useState<(typeof SUPPORT_CATEGORIES)[number]>('TECHNICAL');
  const [message, setMessage] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(profile?.user?.email || '');
    setError(null);
    setSuccess(false);
  }, [isOpen, profile?.user?.email]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadApi.upload(formData);
      setAttachmentUrl(res.data.url);
    } catch {
      setError(t('modals.support.upload_error'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const fullMessage = attachmentUrl
        ? `${message.trim()}\n\n📎 ${t('modals.support.attachment_label')}: ${attachmentUrl}`
        : message.trim();

      await apiClient.post('/support/tickets', {
        email: email.trim() || profile?.user?.email,
        subject: `[${category}] ${subject.trim()}`,
        message: fullMessage,
        userId: profile?.userId || profile?.id,
      });

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setSubject('');
        setMessage('');
        setAttachmentUrl(null);
      }, 2000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t('modals.support.submit_error');
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      className="max-h-[90vh]"
    >
      <div className="-mx-4 -mt-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-3 p-4 border-b border-white/10 shrink-0 pr-14">
          <div className="p-2.5 rounded-2xl bg-brand-primary/20 text-brand-primary border border-brand-primary/30 shrink-0">
            <HelpCircle size={22} aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-black text-white tracking-tight">
              {t('modals.support.title')}
            </h3>
            <p className="text-xs text-gray-400">
              {t('modals.support.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
              <AlertCircle size={16} className="shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="py-12 text-center space-y-3">
              <CheckCircle2
                size={48}
                className="mx-auto text-green-400"
                aria-hidden
              />
              <h4 className="text-lg font-bold text-white">
                {t('modals.support.success_title')}
              </h4>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                {t('modals.support.success_desc')}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="support-email"
                  className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1"
                >
                  {t('modals.support.email_label')}
                </label>
                <input
                  id="support-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('modals.support.email_placeholder')}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 h-12 text-white text-sm focus:outline-none focus:border-brand-primary/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="support-category"
                    className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1"
                  >
                    {t('modals.support.category_label')}
                  </label>
                  <select
                    id="support-category"
                    value={category}
                    onChange={(e) =>
                      setCategory(
                        e.target.value as (typeof SUPPORT_CATEGORIES)[number],
                      )
                    }
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 h-12 text-white text-sm focus:outline-none focus:border-brand-primary/50"
                  >
                    {SUPPORT_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {t(`modals.support.categories.${value}`)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="support-subject"
                    className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1"
                  >
                    {t('modals.support.subject_label')}
                  </label>
                  <input
                    id="support-subject"
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('modals.support.subject_placeholder')}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 h-12 text-white text-sm focus:outline-none focus:border-brand-primary/50"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="support-message"
                  className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1"
                >
                  {t('modals.support.message_label')}
                </label>
                <textarea
                  id="support-message"
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('modals.support.message_placeholder')}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-brand-primary/50 resize-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    const handled = await pickNativeImage(fileInputRef);
                    if (!handled) {
                      fileInputRef.current?.click();
                    }
                  }}
                  disabled={isUploading}
                  className="flex items-center justify-center gap-2 px-3 h-11 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-gray-300 transition-colors"
                >
                  {isUploading ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                  ) : (
                    <ImageIcon size={14} aria-hidden />
                  )}
                  {attachmentUrl
                    ? t('modals.support.attachment_attached')
                    : t('modals.support.attach_screenshot')}
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="px-5 h-11 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50 flex items-center justify-center gap-2 sm:min-w-36"
                >
                  {isSubmitting ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                  ) : (
                    <Send size={14} aria-hidden />
                  )}
                  {t('modals.support.send_button')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Dialog>
  );
}
