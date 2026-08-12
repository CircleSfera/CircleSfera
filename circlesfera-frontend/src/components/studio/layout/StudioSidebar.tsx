import {
  Film,
  FolderPlus,
  Image as ImageIcon,
  Music,
  Plus,
  Sparkles,
  Type,
  Wand2,
} from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useStudioStore } from '../../../stores/studioStore';
import type { MediaClip, StudioTab, TextClip } from '../../../types/studio';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);

interface StudioSidebarProps {
  onAddMediaFile: (file: File) => void;
  onAddAudioFile: (file: File) => void;
}

export default function StudioSidebar({
  onAddMediaFile,
  onAddAudioFile,
}: StudioSidebarProps) {
  const { project, activeTab, setActiveTab, addClip, playhead } =
    useStudioStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const tabs: { id: StudioTab; label: string; icon: any }[] = [
    { id: 'media', label: 'Medios', icon: Film },
    { id: 'text', label: 'Texto', icon: Type },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'filters', label: 'Filtros', icon: Wand2 },
    { id: 'subtitles', label: 'IA Captions', icon: Sparkles },
  ];

  const handleTextPreset = (
    content: string,
    fontSize: number,
    color: string,
    bg: string,
    padding = 8,
    borderRadius = 8,
  ) => {
    if (!project) return;
    let trackId = project.tracks.find((t) => t.type === 'text')?.id;
    if (!trackId) trackId = project.tracks[0].id;

    const newClip: TextClip = {
      id: generateId(),
      trackId,
      type: 'text',
      startAt: playhead,
      duration: 3,
      content,
      style: {
        fontFamily: 'Inter',
        fontSize,
        color,
        backgroundColor: bg,
        padding,
        borderRadius,
        textAlign: 'center',
      },
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    };

    addClip(trackId, newClip);
    toast.success('Texto añadido al lienzo');
  };

  const handleGenerateAICaptions = () => {
    if (!project) return;
    const trackId =
      project.tracks.find((t) => t.type === 'text')?.id || project.tracks[0].id;

    const captions = [
      {
        id: generateId(),
        startAt: 0,
        duration: 2.5,
        text: '✨ ¡Bienvenido a CircleSfera Studio!',
      },
      {
        id: generateId(),
        startAt: 2.5,
        duration: 3.0,
        text: '🔥 Edita vídeo con densidad visual pro.',
      },
      {
        id: generateId(),
        startAt: 5.5,
        duration: 2.5,
        text: '🚀 Exporta y comparte en tu feed.',
      },
    ];

    captions.forEach((cap) => {
      addClip(trackId, {
        id: cap.id,
        trackId,
        type: 'text',
        content: cap.text,
        startAt: cap.startAt,
        duration: cap.duration,
        style: {
          color: '#ffffff',
          fontSize: 32,
          fontFamily: 'Inter',
          backgroundColor: 'rgba(0,0,0,0.75)',
          padding: 10,
          borderRadius: 12,
          textAlign: 'center',
          shadowColor: 'rgba(0,0,0,0.8)',
          shadowBlur: 10,
        },
        transform: { scale: 1, rotation: 0, x: 0, y: 350 },
      });
    });

    toast.success('Subtítulos IA generados exitosamente');
  };

  return (
    <div className="w-full lg:w-72 xl:w-80 bg-[#121216]/95 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col h-full shrink-0 overflow-hidden shadow-2xl z-20">
      {/* Sidebar Tabs Bar */}
      <div className="flex items-center justify-between px-2 py-2 bg-[#0e0e12] border-b border-white/5 overflow-x-auto no-scrollbar gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/25 scale-[1.02]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Panel */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 no-scrollbar">
        {/* MEDIOS TAB */}
        {activeTab === 'media' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-white/50">
                Biblioteca de Archivos
              </span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-white/15 hover:border-brand-primary/60 bg-white/3 hover:bg-brand-primary/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <FolderPlus size={20} />
              </div>
              <p className="text-xs font-semibold text-white">
                Importar Vídeo o Imagen
              </p>
              <span className="text-[10px] text-white/40 flex items-center gap-1">
                <ImageIcon size={10} /> MP4, MOV, WEBM, PNG, JPG (Hasta 4K)
              </span>
            </button>

            {/* Quick Sample Presets */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs font-medium text-white/70">
                Muestras Rápidas
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!project) return;
                    const trackId =
                      project.tracks.find((t) => t.type === 'video')?.id ||
                      project.tracks[0].id;
                    const sampleClip: MediaClip = {
                      id: generateId(),
                      trackId,
                      type: 'image',
                      file: null,
                      fileUrl:
                        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
                      startAt: playhead,
                      duration: 4,
                      mediaStart: 0,
                      speed: 1,
                      volume: 1,
                      muted: true,
                      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
                    };
                    addClip(trackId, sampleClip);
                    toast.success('Imagen Neón agregada');
                  }}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-2.5 flex flex-col items-start gap-1 transition-all text-left group"
                >
                  <div className="w-full h-16 rounded-lg overflow-hidden relative">
                    <img
                      src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80"
                      alt="Sample Gradient"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-white mt-1">
                    Fondo Abstracción Neón
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!project) return;
                    const trackId =
                      project.tracks.find((t) => t.type === 'video')?.id ||
                      project.tracks[0].id;
                    const sampleClip: MediaClip = {
                      id: generateId(),
                      trackId,
                      type: 'image',
                      file: null,
                      fileUrl:
                        'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80',
                      startAt: playhead,
                      duration: 4,
                      mediaStart: 0,
                      speed: 1,
                      volume: 1,
                      muted: true,
                      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
                    };
                    addClip(trackId, sampleClip);
                    toast.success('Fondo Gradiente agregado');
                  }}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-2.5 flex flex-col items-start gap-1 transition-all text-left group"
                >
                  <div className="w-full h-16 rounded-lg overflow-hidden relative">
                    <img
                      src="https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400&auto=format&fit=crop&q=80"
                      alt="Sample Color"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-white mt-1">
                    Gradiente Studio
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TEXTO TAB */}
        {activeTab === 'text' && (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50 mb-1">
              Plantillas de Texto
            </span>

            {[
              {
                title: 'Título Principal Bold',
                content: 'TÍTULO IMPACTO',
                size: 52,
                color: '#ffffff',
                bg: 'rgba(0,0,0,0)',
              },
              {
                title: 'Subtítulo Destacado',
                content: 'Suscripciones & Tiers Pro',
                size: 36,
                color: '#ec4899',
                bg: 'rgba(0,0,0,0.4)',
              },
              {
                title: 'Etiqueta Neón (Badge)',
                content: '★ CIRCLE STUDIO',
                size: 28,
                color: '#8c52ff',
                bg: 'rgba(140, 82, 255, 0.25)',
              },
              {
                title: 'Caja Estilo Story',
                content: '@usuario_creador',
                size: 32,
                color: '#ffffff',
                bg: 'rgba(0, 0, 0, 0.8)',
              },
            ].map((preset) => (
              <button
                key={preset.title}
                type="button"
                onClick={() =>
                  handleTextPreset(
                    preset.content,
                    preset.size,
                    preset.color,
                    preset.bg,
                  )
                }
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 flex items-center justify-between transition-all group"
              >
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-white">
                    {preset.title}
                  </span>
                  <span className="text-[10px] text-white/40">
                    "{preset.content}"
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-brand-primary/20 text-brand-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus size={16} />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* AUDIO TAB */}
        {activeTab === 'audio' && (
          <div className="flex flex-col gap-4">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">
              Pistas de Audio & SFX
            </span>

            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="w-full border border-purple-500/30 hover:border-purple-500/60 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl p-3 flex items-center justify-center gap-2 transition-all text-purple-300 text-xs font-bold"
            >
              <Music size={16} />
              <span>Cargar Audio del Dispositivo</span>
            </button>
          </div>
        )}

        {/* FILTROS TAB */}
        {activeTab === 'filters' && (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">
              Filtros Visuales Globales
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Normal', filter: '' },
                { name: 'Cine B&W', filter: 'grayscale(1) contrast(1.2)' },
                { name: 'Vintage Sepia', filter: 'sepia(0.8) contrast(1.1)' },
                {
                  name: 'Cyber Neón',
                  filter: 'hue-rotate(90deg) saturate(1.8)',
                },
                {
                  name: 'Drama Contrast',
                  filter: 'contrast(1.5) saturate(1.3)',
                },
                { name: 'Invertido', filter: 'invert(0.9)' },
              ].map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => {
                    const selectedId = useStudioStore.getState().selectedClipId;
                    if (selectedId) {
                      useStudioStore
                        .getState()
                        .updateClip(selectedId, { filter: f.filter } as any);
                      toast.success(`Filtro "${f.name}" aplicado`);
                    } else {
                      toast.error('Selecciona un clip para aplicar el filtro');
                    }
                  }}
                  className="bg-white/5 hover:bg-brand-primary/20 border border-white/10 hover:border-brand-primary/50 rounded-xl p-3 text-center transition-all"
                >
                  <span className="text-xs font-semibold text-white block">
                    {f.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SUBTITULOS IA TAB */}
        {activeTab === 'subtitles' && (
          <div className="flex flex-col gap-4 text-center">
            <div className="w-12 h-12 bg-linear-to-br from-purple-500 to-brand-primary rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-purple-500/25">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Subtítulos Automáticos por IA
              </h3>
              <p className="text-xs text-white/50 mt-1">
                Genera subtítulos animados sincronizados automáticamente con el
                audio.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateAICaptions}
              className="w-full bg-linear-to-r from-purple-600 to-brand-primary hover:from-purple-500 hover:to-brand-primary/90 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-purple-500/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 text-xs"
            >
              <Sparkles size={16} />
              <span>Generar Subtítulos IA Ahora</span>
            </button>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) onAddMediaFile(e.target.files[0]);
        }}
        accept="video/*,image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={audioInputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) onAddAudioFile(e.target.files[0]);
        }}
        accept="audio/*"
        className="hidden"
      />
    </div>
  );
}
