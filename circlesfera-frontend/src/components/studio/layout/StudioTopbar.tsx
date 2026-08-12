import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cloud,
  Download,
  FolderOpen,
  Monitor,
  Redo2,
  Scissors,
  Smartphone,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { editsService } from '../../../services/edits.service';
import { useStudioStore } from '../../../stores/studioStore';
import type { AspectRatioType } from '../../../types/studio';

interface StudioTopbarProps {
  onOpenDrafts: () => void;
  onExport: () => void;
  isExporting: boolean;
}

export default function StudioTopbar({
  onOpenDrafts,
  onExport,
  isExporting,
}: StudioTopbarProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    project,
    setProject,
    cloudProjectId,
    setCloudProjectId,
    undo,
    redo,
    canUndo,
    canRedo,
    setAspectRatio,
  } = useStudioStore();

  const currentAspect: AspectRatioType = project?.aspectRatio || '9:16';

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!project) return;
      if (cloudProjectId) {
        return editsService.updateProjectState(cloudProjectId, {
          version: 3,
          studio: project,
        });
      } else {
        return editsService.createProject(
          'studio',
          'video',
          { version: 3, studio: project },
          project.name,
        );
      }
    },
    onSuccess: (data) => {
      if (data?.id) {
        setCloudProjectId(data.id);
        queryClient.invalidateQueries({ queryKey: ['studioDrafts'] });
        toast.success('Borrador guardado en la nube');
      }
    },
  });

  return (
    <div className="h-14 flex items-center justify-between px-3 sm:px-4 shrink-0 border border-white/10 z-30 bg-[#121216]/90 backdrop-blur-xl rounded-xl lg:rounded-2xl shadow-xl">
      {/* Left: Close & Project Title */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
          title="Salir del Studio"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-linear-to-br from-brand-primary to-purple-600 flex items-center justify-center shadow-lg shadow-brand-primary/30 shrink-0">
            <Scissors size={14} className="text-white" />
          </div>
          <input
            type="text"
            value={project?.name || 'Nuevo Proyecto'}
            onChange={(e) =>
              project && setProject({ ...project, name: e.target.value })
            }
            className="bg-transparent border-none text-xs sm:text-sm font-bold text-white w-24 sm:w-36 focus:w-44 transition-all outline-none focus:ring-1 focus:ring-brand-primary/50 rounded px-1.5 py-0.5 placeholder:text-white/30 truncate"
          />
        </div>
      </div>

      {/* Center: Undo/Redo & Aspect Ratio Selector */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Undo / Redo */}
        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Deshacer (Cmd+Z)"
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Rehacer (Cmd+Shift+Z)"
          >
            <Redo2 size={15} />
          </button>
        </div>

        <div className="hidden sm:block w-px h-4 bg-white/10 mx-1" />

        {/* Aspect Ratio Picker */}
        <div className="hidden sm:flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
          {[
            {
              id: '9:16',
              label: '9:16',
              icon: Smartphone,
              title: 'Reels / Stories (9:16)',
            },
            {
              id: '16:9',
              label: '16:9',
              icon: Monitor,
              title: 'Widescreen (16:9)',
            },
            { id: '1:1', label: '1:1', icon: Square, title: 'Cuadrado (1:1)' },
            {
              id: '4:5',
              label: '4:5',
              icon: Smartphone,
              title: 'Retrato (4:5)',
            },
          ].map((ratio) => {
            const Icon = ratio.icon;
            const isSelected = currentAspect === ratio.id;
            return (
              <button
                key={ratio.id}
                type="button"
                onClick={() => setAspectRatio(ratio.id as AspectRatioType)}
                className={`flex items-center justify-center gap-1 px-2 min-h-11 md:min-h-0 md:py-1 rounded-lg text-[11px] font-bold transition-all ${
                  isSelected
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                title={ratio.title}
              >
                <Icon size={12} />
                <span>{ratio.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Cloud Drafts & Export */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onOpenDrafts}
          className="flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/5 px-2.5 min-h-11 md:min-h-0 md:py-1.5 rounded-xl text-xs font-semibold transition-colors"
          title="Borradores"
        >
          <FolderOpen size={15} />
          <span className="hidden md:inline">Abrir</span>
        </button>

        <button
          type="button"
          onClick={() => saveDraftMutation.mutate()}
          disabled={saveDraftMutation.isPending}
          className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/5 px-2.5 min-h-11 md:min-h-0 md:py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
          title="Guardar en la nube"
        >
          <Cloud
            size={15}
            className={
              saveDraftMutation.isPending
                ? 'animate-bounce text-brand-primary'
                : ''
            }
          />
          <span className="hidden md:inline">Guardar</span>
        </button>

        <button
          type="button"
          onClick={onExport}
          disabled={isExporting}
          className="ml-1 bg-linear-to-r from-brand-primary to-purple-600 hover:from-brand-primary/90 hover:to-purple-600/90 text-white font-bold h-11 md:h-8 px-3.5 rounded-xl text-xs shadow-lg shadow-brand-primary/25 transition-all disabled:opacity-50 flex items-center gap-1.5 hover:scale-[1.02] active:scale-95"
        >
          <Download size={14} />
          <span className="font-bold">Exportar</span>
        </button>
      </div>
    </div>
  );
}
