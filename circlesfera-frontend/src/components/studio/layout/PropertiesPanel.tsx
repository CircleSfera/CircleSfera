import { Settings2, X } from 'lucide-react';
import { useStudioStore } from '../../../stores/studioStore';
import type { MediaClip, TextClip } from '../../../types/studio';

export default function PropertiesPanel() {
  const { project, selectedClipId, selectClip, updateClip } = useStudioStore();

  const selectedClip = project?.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId);

  if (!selectedClip) return null;

  return (
    <div className="bg-[#121216]/95 border-b lg:border-b-0 border-white/10 p-3 lg:p-3 rounded-t-2xl lg:rounded-none shadow-2xl lg:shadow-none flex flex-col lg:flex-col lg:w-64 xl:w-72 shrink-0 gap-3 overflow-y-auto animate-in slide-in-from-bottom lg:slide-in-from-right duration-300">
      <div className="flex items-center justify-between w-full pb-2 border-b border-white/5">
        <div className="flex items-center gap-2.5 text-[11px] font-bold text-white/60 uppercase tracking-[0.2em]">
          <Settings2 size={16} className="text-brand-primary" />
          <span>Propiedades ({selectedClip.type})</span>
        </div>
        <button
          type="button"
          onClick={() => selectClip(null)}
          className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all"
          aria-label="Cerrar propiedades"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {selectedClip.type === 'text' && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-white/70">Texto</span>
              <textarea
                value={(selectedClip as TextClip).content}
                onChange={(e) =>
                  updateClip(selectedClip.id, {
                    content: e.target.value,
                  } as any)
                }
                className="bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white w-full outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 transition-all resize-none h-16"
                placeholder="Escribe algo..."
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/70">Color</span>
              <input
                type="color"
                value={(selectedClip as TextClip).style.color}
                onChange={(e) => {
                  const currentStyle = (selectedClip as TextClip).style;
                  updateClip(selectedClip.id, {
                    style: { ...currentStyle, color: e.target.value },
                  } as any);
                }}
                className="w-8 h-8 rounded-full cursor-pointer bg-transparent border-0 p-0"
              />
            </div>
          </>
        )}

        {(selectedClip.type === 'video' || selectedClip.type === 'audio') && (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center w-full">
                <span className="text-xs font-medium text-white/80">
                  Volumen
                </span>
                <span className="text-[10px] text-brand-primary font-mono bg-brand-primary/10 px-1.5 py-0.5 rounded-md border border-brand-primary/20">
                  {Math.round(((selectedClip as MediaClip).volume ?? 1) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={(selectedClip as MediaClip).volume ?? 1}
                onChange={(e) =>
                  updateClip(selectedClip.id, {
                    volume: parseFloat(e.target.value),
                  } as any)
                }
                className="w-full appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:bg-white/10 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:bg-brand-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/80">
                Velocidad
              </span>
              <div className="relative">
                <select
                  value={(selectedClip as MediaClip).speed ?? 1}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      speed: parseFloat(e.target.value),
                    } as any)
                  }
                  className="w-full bg-white/5 text-white text-[11px] px-2.5 py-1.5 rounded-lg outline-none border border-white/10 focus:border-brand-primary appearance-none hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <option value="0.5" className="bg-[#121216]">
                    0.5x (Lento)
                  </option>
                  <option value="1" className="bg-[#121216]">
                    1.0x (Normal)
                  </option>
                  <option value="1.5" className="bg-[#121216]">
                    1.5x (Rápido)
                  </option>
                  <option value="2" className="bg-[#121216]">
                    2.0x (Muy Rápido)
                  </option>
                </select>
                <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none text-white/40">
                  <svg
                    aria-hidden="true"
                    width="10"
                    height="6"
                    viewBox="0 0 12 8"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1 1.5L6 6.5L11 1.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {selectedClip.type === 'video' && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-white/80">
                  Filtro Visual
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Ninguno', value: '' },
                    { label: 'B&W', value: 'grayscale(1)' },
                    { label: 'Sepia', value: 'sepia(1)' },
                    { label: 'Invertir', value: 'invert(1)' },
                  ].map((filter) => (
                    <button
                      key={filter.label}
                      type="button"
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          filter: filter.value,
                        } as any)
                      }
                      className={`px-1.5 py-1 text-[10px] font-medium rounded-md border transition-all ${
                        (selectedClip as MediaClip).filter === filter.value ||
                        (!filter.value && !(selectedClip as MediaClip).filter)
                          ? 'bg-brand-primary/20 border-brand-primary/50 text-brand-primary shadow-[0_0_15px_rgba(131,58,180,0.15)]'
                          : 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
