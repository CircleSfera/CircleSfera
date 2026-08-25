import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, FolderOpen, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { editsService } from '../../../services/edits.service';
import { useStudioStore } from '../../../stores/studioStore';
import type { StudioProject } from '../../../types/studio';
import { Dialog } from '../../ui/Dialog';

interface DraftsModalProps {
  onClose: () => void;
}

function isValidStudioDraft(state: unknown): state is {
  version: 3;
  studio: StudioProject;
} {
  if (!state || typeof state !== 'object') return false;
  const s = state as { version?: number; studio?: StudioProject };
  return (
    s.version === 3 &&
    !!s.studio &&
    typeof s.studio === 'object' &&
    Array.isArray(s.studio.tracks)
  );
}

export default function DraftsModal({ onClose }: DraftsModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setProject, setCloudProjectId, cloudProjectId } = useStudioStore();

  const {
    data: drafts,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['studioDrafts'],
    queryFn: () => editsService.getProjects(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => editsService.deleteProject(id),
    onSuccess: (_, id) => {
      if (cloudProjectId === id) {
        setCloudProjectId(null);
      }
      queryClient.invalidateQueries({ queryKey: ['studioDrafts'] });
      toast.success(t('studio.drafts.deleted'));
    },
    onError: () => {
      toast.error(t('studio.drafts.delete_error'));
    },
  });

  const studioDrafts = (drafts || []).filter((d) =>
    isValidStudioDraft(d.state),
  );

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={t('studio.drafts.title')}
      maxWidth="md"
    >
      <div className="p-4 overflow-y-auto max-h-[60vh] no-scrollbar">
        {isLoading && (
          <p className="text-center text-white/50 py-8 text-sm">
            {t('common.loading')}
          </p>
        )}
        {isError && (
          <p className="text-center text-brand-secondary py-8 text-sm">
            {t('studio.drafts.error')}
          </p>
        )}
        {!isLoading && !isError && studioDrafts.length === 0 && (
          <div className="text-center py-12 flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white/20">
              <Cloud size={32} />
            </div>
            <p className="text-white/50 font-medium text-sm">
              {t('studio.drafts.empty')}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {studioDrafts.map((draft) => {
            const studio = isValidStudioDraft(draft.state)
              ? draft.state.studio
              : null;
            return (
              <div
                key={draft.id}
                className="flex items-center gap-2 bg-white/5 border border-white/5 p-2 rounded-xl hover:bg-white/10 hover:border-white/10 transition-all group"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (studio) {
                      setProject(studio);
                      setCloudProjectId(draft.id);
                      onClose();
                    }
                  }}
                  className="flex flex-1 items-center gap-4 p-2 text-left min-h-11"
                >
                  <div className="w-12 h-12 bg-black/40 rounded flex flex-col items-center justify-center text-brand-primary">
                    <FolderOpen size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white truncate">
                      {draft.name ||
                        studio?.name ||
                        t('studio.default_project_name')}
                    </h3>
                    <p className="text-xs text-white/50 mt-0.5">
                      {t('studio.drafts.updated', {
                        date: new Date(draft.updatedAt).toLocaleDateString(),
                      })}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('studio.drafts.delete_confirm'))) {
                      deleteMutation.mutate(draft.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-white/40 hover:text-brand-secondary hover:bg-white/5 transition-colors disabled:opacity-50"
                  aria-label={t('studio.drafts.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
