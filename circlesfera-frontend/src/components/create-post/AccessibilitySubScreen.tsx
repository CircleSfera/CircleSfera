import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import React from 'react';
import { parseFilter } from '../../utils/styleUtils';

interface AccessibilitySubScreenProps {
  mediaFiles: Array<{ url: string; file: File; type: string; filter?: string }>;
  altTextMap: Record<number, string>;
  setAltTextMap: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  onRemoveFile: (index: number) => void;
  onClose: () => void;
  onGenerateAltText: (index: number) => Promise<void>;
}

export default function AccessibilitySubScreen({
  mediaFiles,
  altTextMap,
  setAltTextMap,
  onRemoveFile,
  onClose,
  onGenerateAltText,
}: AccessibilitySubScreenProps) {
  const [generatingIdx, setGeneratingIdx] = React.useState<number | null>(null);

  const handleAiGenerate = async (idx: number) => {
    setGeneratingIdx(idx);
    try {
      await onGenerateAltText(idx);
    } finally {
      setGeneratingIdx(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl p-4 animate-in fade-in duration-300">
      <div className="bg-neutral-900 border border-white/5 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-[0_32px_120px_-10px_rgba(0,0,0,0.9)] flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
              aria-label="Go back"
            >
              <svg
                aria-hidden="true"
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div>
              <h2 className="font-black text-xl tracking-tighter text-white italic uppercase">
                Accesibilidad
              </h2>
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                Optimiza para lectores de pantalla
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-full bg-white text-black font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform"
          >
            Listo
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10">
          <div className="p-4 rounded-2xl bg-brand-primary/5 border border-brand-primary/10">
            <p className="text-zinc-400 text-xs font-medium leading-relaxed italic">
              "El texto alternativo describe tus fotos para personas con
              discapacidad visual. CircleSfera puede ayudarte a generarlos
              usando nuestra IA propietaria."
            </p>
          </div>

          <div className="space-y-8">
            {mediaFiles.map((item, idx) => {
              const { className, style } = parseFilter(item.filter);
              const isGenerating = generatingIdx === idx;

              return (
                <div
                  key={item.url}
                  className="group flex flex-col sm:flex-row gap-6 p-4 rounded-3xl bg-white/5 border border-white/5 hover:border-white/10 transition-all"
                >
                  <div className="w-full sm:w-24 h-24 rounded-2xl overflow-hidden shrink-0 border border-white/10 relative shadow-2xl">
                    {item.type === 'video' ? (
                      <video
                        src={item.url}
                        className={`w-full h-full object-cover ${className}`}
                        style={style}
                        muted
                        playsInline
                      >
                        <track kind="captions" />
                      </video>
                    ) : (
                      <img
                        src={item.url}
                        alt=""
                        className={`w-full h-full object-cover ${className}`}
                        style={style}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveFile(idx)}
                      aria-label="Remove media"
                      className="absolute top-2 right-2 w-8 h-8 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white/90 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/80 hover:scale-110 active:scale-95 z-10 border border-white/10"
                    >
                      <Trash2 size={14} strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="relative">
                      <textarea
                        rows={3}
                        value={altTextMap[idx] || ''}
                        onChange={(e) =>
                          setAltTextMap((prev) => ({
                            ...prev,
                            [idx]: e.target.value,
                          }))
                        }
                        placeholder="Escribe el texto alternativo..."
                        className="w-full bg-neutral-950/50 border border-white/5 rounded-2xl p-4 text-xs font-medium text-white placeholder-zinc-600 focus:outline-none focus:border-brand-primary/50 transition-all resize-none"
                      />

                      {item.type === 'image' && (
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() => handleAiGenerate(idx)}
                          className={`absolute bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                            isGenerating
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-500'
                              : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary hover:bg-brand-primary hover:text-white'
                          }`}
                        >
                          {isGenerating ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          <span className="text-[9px] font-black uppercase tracking-widest">
                            {isGenerating ? 'Generando...' : 'IA Mágica'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
