import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Cloud, Download, FolderOpen, Scissors, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { editsService } from '../../../services/edits.service';
import { useStudioStore } from '../../../stores/studioStore';
import { Button } from '../../ui';

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
  const { project, setProject, cloudProjectId, setCloudProjectId } =
    useStudioStore();

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
        alert('Borrador guardado en la nube exitosamente');
      }
    },
  });

  return (
    <div className="h-14 flex items-center justify-between px-4 shrink-0 border border-white/5 z-20 bg-[#121216]/80 backdrop-blur-xl rounded-xl lg:rounded-2xl shadow-lg">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-linear-to-br from-brand-primary to-brand-blue flex items-center justify-center shadow-lg shadow-brand-primary/20">
            <Scissors size={12} className="text-white" />
          </div>
          <input
            type="text"
            value={project?.name || 'Nuevo Proyecto'}
            onChange={(e) =>
              project && setProject({ ...project, name: e.target.value })
            }
            className="bg-transparent border-none text-sm font-bold text-white w-24 sm:w-32 focus:w-36 sm:focus:w-48 transition-all outline-none focus:ring-1 focus:ring-brand-primary/50 rounded px-1 -ml-1 placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenDrafts}
          className="flex items-center gap-1.5 text-white/60 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          title="Abrir borrador"
        >
          <FolderOpen size={16} />
          <span className="hidden md:inline">Abrir</span>
        </button>

        <div className="w-px h-4 bg-white/10 mx-1" />

        <button
          type="button"
          onClick={() => saveDraftMutation.mutate()}
          disabled={saveDraftMutation.isPending}
          className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          title="Guardar en la nube"
        >
          <Cloud
            size={16}
            className={saveDraftMutation.isPending ? 'animate-bounce' : ''}
          />
          <span className="hidden md:inline">Guardar</span>
        </button>

        <Button
          variant="primary"
          onClick={onExport}
          disabled={isExporting}
          className="ml-2 bg-brand-primary! text-white! hover:bg-brand-primary/90! h-8 px-4 rounded-full text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Exportar</span>
        </Button>
      </div>
    </div>
  );
}
