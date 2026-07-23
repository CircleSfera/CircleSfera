import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Layout,
  Send,
  Type,
} from 'lucide-react';
import { useState } from 'react';
import { adminApi } from '../../services/admin.service';
import { Button, Input, Textarea } from '../ui';
import { AdminPageHeader } from './AdminPageHeader';

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
      <AdminPageHeader
        title="Comunicaciones Masivas"
        subtitle="Envía comunicaciones oficiales a todos los usuarios activos de CircleSfera"
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPreview(!showPreview)}
              className="min-h-11 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all border border-white/10 hover:bg-white/5 text-gray-300"
            >
              {showPreview ? 'Editar Contenido' : 'Vista Previa'}
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending}
              className="min-h-11 px-4 py-2.5 text-xs font-semibold"
            >
              {isSending ? (
                <>
                  <CheckCircle2 size={16} className="mr-2" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={16} className="mr-2" />
                  Enviar Broadcast
                </>
              )}
            </Button>
          </>
        }
      />

      <div className="glass-panel p-4 sm:p-6 rounded-lg border border-white/5">
        <div className="flex flex-col lg:flex-row gap-6">
          {!showPreview && (
            <div className="flex-1 space-y-4 order-1">
              <div className="space-y-2">
                <label
                  htmlFor="subject"
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-1 flex items-center gap-2"
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
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-1 flex items-center gap-2"
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
                  className="font-semibold"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="content"
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-1"
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
                  className="min-h-[200px] resize-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="buttonText"
                    className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-1"
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
                    className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-1"
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
          )}

          {showPreview && (
            <div className="flex-1 order-2">
              <div className="bg-black border border-white/10 rounded-lg overflow-hidden max-w-2xl mx-auto shadow-2xl">
                <div className="bg-surface-elevated px-6 py-4 border-b border-white/5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center">
                    <span className="text-brand-primary font-semibold text-xs">
                      CS
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-xs font-semibold">
                      CircleSfera Newsletter
                    </p>
                    <p className="text-gray-500 text-xs truncate">
                      Asunto: {formData.subject || '(Sin asunto)'}
                    </p>
                  </div>
                </div>

                <div className="p-10 text-center space-y-4 bg-black">
                  <h1 className="text-xl font-semibold text-white tracking-tight leading-tight">
                    {formData.title || 'Título del Correo'}
                  </h1>
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {formData.content ||
                      'El contenido de tu mensaje aparecerá aquí...'}
                  </p>

                  {formData.buttonText && formData.buttonUrl && (
                    <div className="pt-6">
                      <span className="inline-block px-8 py-3 bg-white text-black font-semibold text-xs rounded-full uppercase tracking-wide shadow-xl">
                        {formData.buttonText}
                      </span>
                    </div>
                  )}

                  <div className="pt-10 border-t border-white/5">
                    <p className="text-xs text-gray-600 font-semibold uppercase tracking-wide">
                      CircleSfera © 2026 ·{' '}
                      <span className="text-brand-primary">
                        Verified Communications
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-6 flex items-start gap-4">
        <AlertTriangle className="text-orange-500 shrink-0 mt-0.5" size={18} />
        <div>
          <h4 className="text-orange-500 text-xs font-semibold uppercase tracking-wide mb-1">
            Aviso de Seguridad
          </h4>
          <p className="text-gray-300 text-xs leading-relaxed">
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
