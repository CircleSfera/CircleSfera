import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, uploadApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportTicketModal({
  isOpen,
  onClose,
}: SupportTicketModalProps) {
  const { t } = useTranslation();
  const { profile } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState(profile?.user?.email || '');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('TECHNICAL');
  const [message, setMessage] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      setError(
        t(
          'support.upload_error',
          'Error al subir la captura de pantalla adjunta.',
        ),
      );
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
        ? `${message.trim()}\n\n📎 Adjunto: ${attachmentUrl}`
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
        err instanceof Error
          ? err.message
          : t('support.submit_error', 'Error al enviar la solicitud.');
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-lg bg-zinc-950 border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden relative"
        >
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                <HelpCircle size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">
                  {t('support.modal_title', 'Centro de Ayuda y Soporte')}
                </h3>
                <p className="text-xs text-gray-400">
                  {t(
                    'support.modal_subtitle',
                    'Envía una consulta o reporte a nuestro equipo técnico',
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="py-12 text-center space-y-3">
              <CheckCircle2 size={48} className="mx-auto text-green-400" />
              <h4 className="text-lg font-bold text-white">
                {t('support.success_title', '¡Ticket Enviado!')}
              </h4>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                {t(
                  'support.success_desc',
                  'Hemos recibido tu mensaje. Te responderemos a la brevedad.',
                )}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="support-email"
                  className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1"
                >
                  {t('support.email_label', 'Correo Electrónico')}
                </label>
                <input
                  id="support-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="support-category"
                    className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1"
                  >
                    {t('support.category_label', 'Categoría')}
                  </label>
                  <select
                    id="support-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-brand-primary/50"
                  >
                    <option value="TECHNICAL">Error Técnico</option>
                    <option value="BILLING">Facturación y Cobros</option>
                    <option value="ACCOUNT">Cuenta y Acceso</option>
                    <option value="SUGGESTION">Sugerencia</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="support-subject"
                    className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1"
                  >
                    {t('support.subject_label', 'Asunto')}
                  </label>
                  <input
                    id="support-subject"
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Resumen del problema"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-primary/50"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="support-message"
                  className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1"
                >
                  {t('support.message_label', 'Mensaje Detallado')}
                </label>
                <textarea
                  id="support-message"
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe detalladamente tu consulta..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-brand-primary/50 resize-none"
                />
              </div>

              {/* Attachment option */}
              <div className="flex items-center justify-between pt-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-gray-300 transition-colors"
                >
                  {isUploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ImageIcon size={14} />
                  )}
                  {attachmentUrl
                    ? 'Captura Adjuntada ✓'
                    : 'Adjuntar Captura de Pantalla'}
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="px-5 py-2.5 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  {t('support.send_button', 'Enviar Ticket')}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
