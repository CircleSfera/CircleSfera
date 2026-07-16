import { Download } from 'lucide-react';
import { Button } from '../../ui/Button';

interface ExportModalProps {
  isExporting: boolean;
  exportProgress: number;
  exportedBlob: Blob | null;
  onClose: () => void;
  onPublish: () => void;
  onDownload: () => void;
}

export default function ExportModal({
  isExporting,
  exportProgress,
  exportedBlob,
  onClose,
  onPublish,
  onDownload,
}: ExportModalProps) {
  if (!isExporting && !exportedBlob) return null;

  return (
    <div className="absolute inset-0 z-50 modal-glass flex flex-col items-center justify-center animate-in">
      {isExporting ? (
        <div className="flex flex-col items-center">
          <div className="w-64 bg-zinc-900/50 rounded-full h-2 overflow-hidden border border-white/10 shadow-inner">
            <div
              className="h-full bg-brand-primary transition-all duration-300 shadow-[0_0_10px_rgba(131,58,180,0.8)]"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
          <p className="mt-4 text-white font-bold animate-pulse">
            Renderizando... {Math.round(exportProgress)}%
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900/80 backdrop-blur-xl p-8 rounded-2xl border border-white/10 shadow-2xl w-full max-w-sm flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-brand-primary/20 text-brand-primary rounded-full flex items-center justify-center mb-4 ring-1 ring-brand-primary/50">
            <Download size={32} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">¡Vídeo listo!</h2>
          <p className="text-white/60 mb-8 text-sm">
            Tu proyecto ha sido renderizado exitosamente.
          </p>

          <div className="flex flex-col gap-3 w-full">
            <Button
              variant="primary"
              onClick={onPublish}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 hover:scale-[1.02] transition-all"
            >
              Publicar en CircleSfera
            </Button>
            <Button
              variant="outline"
              onClick={onDownload}
              className="w-full hover:bg-white/5"
            >
              Descargar al dispositivo
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 text-white/40 hover:text-white/80 text-sm font-medium transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
