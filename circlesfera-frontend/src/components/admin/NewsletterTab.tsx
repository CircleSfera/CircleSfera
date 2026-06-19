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
import { Button, Input, Textarea } from '../ui';
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
    <div className="space-y-4">
      <div className="glass-panel p-4 rounded-lg border border-white/5">
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all border border-white/10 hover:bg-white/5 text-gray-400"
            >
              {showPreview ? 'Editar Contenido' : 'Vista Previa'}
            </Button>
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
          <div className="bg-black border border-white/10 rounded-lg overflow-hidden max-w-2xl mx-auto shadow-2xl">
            {/* Mock Email UI */}
            <div className="bg-[#0a0a0a] px-6 py-4 border-b border-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center">
                <span className="text-brand-primary font-black text-xs">
                  CS
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-bold">
                  CircleSfera Newsletter
                </p>
                <p className="text-gray-500 text-xs truncate">
                  Asunto: {formData.subject || '(Sin asunto)'}
                </p>
              </div>
            </div>

            <div className="p-10 text-center space-y-4 bg-black">
              <h1 className="text-xl font-black text-white tracking-tight leading-tight">
                {formData.title || 'Título del Correo'}
              </h1>
              <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">
                {formData.content ||
                  'El contenido de tu mensaje aparecerá aquí...'}
              </p>

              {formData.buttonText && formData.buttonUrl && (
                <div className="pt-6">
                  <span className="inline-block px-8 py-3 bg-white text-black font-black text-xs rounded-full uppercase tracking-wide shadow-xl">
                    {formData.buttonText}
                  </span>
                </div>
              )}

              <div className="pt-10 border-t border-white/5">
                <p className="text-xs text-gray-600 font-bold uppercase tracking-wide">
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
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="subject"
                  className="text-xs font-black text-gray-500 uppercase tracking-wide ml-1 flex items-center gap-2"
                >
                  <Type size={12} /> Asunto del Email (Interno)
                </label>
                <Input
                  id="subject"
                  type="text"
                  placeholder="Ej: ¡Novedades importantes en CircleSfera!"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="title"
                  className="text-xs font-black text-gray-500 uppercase tracking-wide ml-1 flex items-center gap-2"
                >
                  <Layout size={12} /> Título Principal (Heading)
                </label>
                <Input
                  id="title"
                  type="text"
                  placeholder="Ej: Nueva funcionalidad exclusiva"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="font-black"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="buttonText"
                    className="text-xs font-black text-gray-500 uppercase tracking-wide ml-1"
                  >
                    Texto del Botón
                  </label>
                  <Input
                    id="buttonText"
                    type="text"
                    placeholder="Ej: Ver ahora"
                    value={formData.buttonText}
                    onChange={(e) =>
                      setFormData({ ...formData, buttonText: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="buttonUrl"
                    className="text-xs font-black text-gray-500 uppercase tracking-wide ml-1"
                  >
                    URL del Botón
                  </label>
                  <div className="relative">
                    <ExternalLink
                      size={14}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600"
                    />
                    <Input
                      id="buttonUrl"
                      type="text"
                      placeholder="https://..."
                      value={formData.buttonUrl}
                      onChange={(e) =>
                        setFormData({ ...formData, buttonUrl: e.target.value })
                      }
                      className="pr-10"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 flex flex-col h-full">
              <label
                htmlFor="content"
                className="text-xs font-black text-gray-500 uppercase tracking-wide ml-1"
              >
                Contenido del Mensaje
              </label>
              <Textarea
                id="content"
                placeholder="Escribe el cuerpo del mensaje aquí. Soporta texto plano y saltos de línea..."
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                className="min-h-[300px] resize-none leading-relaxed"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-6 flex items-start gap-4">
        <AlertTriangle className="text-orange-500 shrink-0 mt-0.5" size={18} />
        <div>
          <h4 className="text-orange-500 text-xs font-black uppercase tracking-wide mb-1">
            Aviso de Seguridad
          </h4>
          <p className="text-gray-400 text-xs leading-relaxed">
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
