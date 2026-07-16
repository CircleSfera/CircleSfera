import { useQuery } from '@tanstack/react-query';
import { Cloud, FolderOpen, X } from 'lucide-react';
import { editsService } from '../../../services/edits.service';
import { useStudioStore } from '../../../stores/studioStore';

interface DraftsModalProps {
  onClose: () => void;
}

export default function DraftsModal({ onClose }: DraftsModalProps) {
  const { setProject, setCloudProjectId } = useStudioStore();

  const { data: drafts } = useQuery({
    queryKey: ['studioDrafts'],
    queryFn: () => editsService.getProjects(),
  });

  return (
    <div className="absolute inset-0 z-50 modal-glass flex flex-col items-center justify-center animate-in p-4">
      <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center p-6 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">Mis Borradores</h2>
            <p className="text-sm text-white/50">
              Proyectos guardados en la nube
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 no-scrollbar">
          {!drafts || drafts.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white/20">
                <Cloud size={32} />
              </div>
              <p className="text-white/50 font-medium">
                No tienes borradores guardados
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {drafts
                .filter((d) => (d.state as any)?.version === 3)
                .map((draft) => {
                  const studio = (draft.state as any)?.studio;
                  return (
                    <button
                      type="button"
                      key={draft.id}
                      onClick={() => {
                        setProject(studio);
                        setCloudProjectId(draft.id);
                        onClose();
                      }}
                      className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-xl hover:bg-white/10 hover:border-white/10 hover:scale-[1.01] transition-all text-left group"
                    >
                      <div className="w-12 h-12 bg-black/40 rounded flex flex-col items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                        <FolderOpen size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-white truncate">
                          {draft.name || studio?.name || 'Proyecto'}
                        </h3>
                        <p className="text-xs text-white/50 mt-0.5">
                          Actualizado:{' '}
                          {new Date(draft.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
