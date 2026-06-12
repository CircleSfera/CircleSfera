import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Layout,
  Mail,
  Send,
  Type,
} from 'lucide-react';
import { useState } from 'react';
import { adminApi } from '../../services/admin.service';
import { ActionButton } from './AdminTable';

export default function NewsletterTab({
  onToast,
}: {
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [formData, setFormData] = useState({
    subject: '',
    title: '',
    content: '',
    buttonText: '',
    buttonUrl: '',
  });
  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleSend = async () => {
    if (!formData.subject || !formData.title || !formData.content) {
      onToast('Por favor, completa los campos obligatorios', 'error');
      return;
    }

    if (
      !confirm(
        '¿Estás seguro de que deseas enviar este correo masivo a TODOS los usuarios activos? Esta acción no se puede deshacer.',
      )
    ) {
      return;
    }

    setIsSending(true);
    try {
      await adminApi.sendBroadcast(formData);
      onToast('Newsletter enviada con éxito', 'success');
      setFormData({
        subject: '',
        title: '',
        content: '',
        buttonText: '',
        buttonUrl: '',
      });
    } catch (error) {
      console.error(error);
      onToast('Error al enviar la newsletter', 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 rounded-2xl border border-white/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Mail className="text-brand-primary" size={20} />
              Comunicaciones Masivas
            </h3>
            <p className="text-gray-500 text-xs mt-1">
              Envía comunicaciones oficiales a todos los usuarios activos de
              CircleSfera.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all border border-white/10 hover:bg-white/5 text-gray-400"
            >
              {showPreview ? 'Editar Contenido' : 'Vista Previa'}
            </button>
            <ActionButton
              label={isSending ? 'Enviando...' : 'Enviar Broadcast'}
              icon={isSending ? CheckCircle2 : Send}
              onClick={handleSend}
              variant="primary"
              disabled={isSending}
            />
          </div>
        </div>

        {showPreview ? (
          <div className="bg-black border border-white/10 rounded-2xl overflow-hidden max-w-2xl mx-auto shadow-2xl">
            {/* Mock Email UI */}
            <div className="bg-[#0a0a0a] px-6 py-4 border-b border-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center">
                <span className="text-brand-primary font-black text-[10px]">
                  CS
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-[11px] font-bold">
                  CircleSfera Newsletter
                </p>
                <p className="text-gray-500 text-[10px] truncate">
                  Asunto: {formData.subject || '(Sin asunto)'}
                </p>
              </div>
            </div>

            <div className="p-10 text-center space-y-6 bg-black">
              <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
                {formData.title || 'Título del Correo'}
              </h1>
              <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">
                {formData.content ||
                  'El contenido de tu mensaje aparecerá aquí...'}
              </p>

              {formData.buttonText && formData.buttonUrl && (
                <div className="pt-6">
                  <span className="inline-block px-8 py-3 bg-white text-black font-black text-xs rounded-full uppercase tracking-widest shadow-xl">
                    {formData.buttonText}
                  </span>
                </div>
              )}

              <div className="pt-10 border-t border-white/5">
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                  CircleSfera © 2026 ·{' '}
                  <span className="text-brand-primary">
                    Verified Communications
                  </span>
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label
                  htmlFor="subject"
                  className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2"
                >
                  <Type size={12} /> Asunto del Email (Interno)
                </label>
                <input
                  id="subject"
                  type="text"
                  placeholder="Ej: ¡Novedades importantes en CircleSfera!"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-hidden focus:border-brand-primary/50 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="title"
                  className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2"
                >
                  <Layout size={12} /> Título Principal (Heading)
                </label>
                <input
                  id="title"
                  type="text"
                  placeholder="Ej: Nueva funcionalidad exclusiva"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-hidden focus:border-brand-primary/50 transition-all font-black"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="buttonText"
                    className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1"
                  >
                    Texto del Botón
                  </label>
                  <input
                    id="buttonText"
                    type="text"
                    placeholder="Ej: Ver ahora"
                    value={formData.buttonText}
                    onChange={(e) =>
                      setFormData({ ...formData, buttonText: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-hidden focus:border-brand-primary/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="buttonUrl"
                    className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1"
                  >
                    URL del Botón
                  </label>
                  <div className="relative">
                    <ExternalLink
                      size={14}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600"
                    />
                    <input
                      id="buttonUrl"
                      type="text"
                      placeholder="https://..."
                      value={formData.buttonUrl}
                      onChange={(e) =>
                        setFormData({ ...formData, buttonUrl: e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-hidden focus:border-brand-primary/50 transition-all pr-10"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 flex flex-col h-full">
              <label
                htmlFor="content"
                className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1"
              >
                Contenido del Mensaje
              </label>
              <textarea
                id="content"
                placeholder="Escribe el cuerpo del mensaje aquí. Soporta texto plano y saltos de línea..."
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                className="flex-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-sm text-white placeholder:text-gray-600 focus:outline-hidden focus:border-brand-primary/50 transition-all min-h-[300px] resize-none leading-relaxed"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-6 flex items-start gap-4">
        <AlertTriangle className="text-orange-500 shrink-0 mt-0.5" size={18} />
        <div>
          <h4 className="text-orange-500 text-xs font-black uppercase tracking-widest mb-1">
            Aviso de Seguridad
          </h4>
          <p className="text-gray-400 text-[11px] leading-relaxed">
            Al enviar este mensaje, se enviará un correo electrónico individual
            a cada uno de los usuarios activos registrados en el sistema.
            Asegúrate de que el contenido cumple con nuestras políticas de
            comunicación y que no contiene información sensible o errónea.
          </p>
        </div>
      </div>
    </div>
  );
}
