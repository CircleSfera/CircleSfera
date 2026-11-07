import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SEO from '../components/common/SEO';
import ConfirmModal from '../components/modals/ConfirmModal';
import { formatClock } from '../components/studio/editor/EditorTimeline';
import TemplatesSection from '../components/studio/home/TemplatesSection';
import { type EditProject, editsService } from '../services/edits.service';
import { useStudioStore } from '../stores/studioStore';
import type { StudioProject } from '../types/studio';
import { formatDate } from '../utils/format';
import {
  clearLocalStudioDraft,
  loadLocalStudioDraft,
} from '../utils/studioLocalDraft';
import { projectContentEnd } from '../utils/studioProject';
import { newBlankProject } from '../utils/studioProjects';

export const EDITOR_PATH = '/edits/editor';

/** A project saved by the studio, as opposed to an edit of a single photo. */
export function studioOf(draft: EditProject): StudioProject | null {
  const state = draft.state as { version?: number; studio?: StudioProject };
  return state?.version === 3 && Array.isArray(state.studio?.tracks)
    ? (state.studio as StudioProject)
    : null;
}

function Thumbnail({ url, type }: { url: string; type: string }) {
  if (type === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(url)) {
    return (
      <video
        src={`${url}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
        aria-hidden
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
    />
  );
}

/** The Edits Studio's first screen: a new project, and the projects kept. */
export default function EditsHome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const setProject = useStudioStore((s) => s.setProject);
  const setCloudProjectId = useStudioStore((s) => s.setCloudProjectId);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<StudioProject | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['studioDrafts'],
    queryFn: () => editsService.getProjects(),
  });
  const projects = (data ?? [])
    .map((draft) => ({ draft, studio: studioOf(draft) }))
    .filter(
      (p): p is { draft: EditProject; studio: StudioProject } =>
        p.studio !== null,
    );

  // A project left on this device before it reached the cloud.
  useEffect(() => {
    let live = true;
    void loadLocalStudioDraft().then((local) => {
      if (
        live &&
        local?.project &&
        !local.cloudProjectId &&
        projectContentEnd(local.project) > 0
      ) {
        setUnsaved(local.project);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const remove = useMutation({
    mutationFn: (id: string) => editsService.deleteProject(id),
    onSuccess: (_, id) => {
      // The project deleted was the one open: it is closed too, so going
      // back to the editor cannot save it again.
      if (useStudioStore.getState().cloudProjectId === id) {
        setCloudProjectId(null);
        useStudioStore.setState({
          project: null,
          selectedClipId: null,
          openSheet: null,
          past: [],
          future: [],
          canUndo: false,
          canRedo: false,
        });
        void clearLocalStudioDraft();
      }
      queryClient.invalidateQueries({ queryKey: ['studioDrafts'] });
      toast.success(t('studio.drafts.deleted'));
    },
    onError: () => toast.error(t('studio.drafts.delete_error')),
  });

  const open = (studio: StudioProject, cloudId: string | null) => {
    setProject(studio);
    setCloudProjectId(cloudId);
    navigate(EDITOR_PATH);
  };

  // One new project per press: a second press while the first is being
  // made does nothing.
  const [starting, setStarting] = useState(false);
  const startNew = async () => {
    if (starting) return;
    setStarting(true);
    await clearLocalStudioDraft();
    open(newBlankProject(t('studio.default_project_name'), t), null);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-4 md:px-8 md:pt-8">
      <SEO title={t('studio.seo_title')} />
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-white">
          {t('studio.home.title')}
        </h1>
        <p className="mt-1 text-sm text-white/60">
          {t('studio.home.subtitle')}
        </p>
      </header>

      <button
        type="button"
        onClick={() => void startNew()}
        disabled={starting}
        className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-black"
      >
        <Plus size={18} aria-hidden />
        {t('studio.home.new')}
      </button>

      <TemplatesSection
        fromPostId={searchParams.get('template')}
        onOpen={(studio) => open(studio, null)}
      />

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/50">
        {t('studio.home.projects')}
      </h2>

      {isLoading && (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          aria-hidden
        >
          {[0, 1, 2, 3].map((n) => (
            <div
              key={n}
              className="aspect-9/16 animate-pulse rounded-2xl bg-white/5"
            />
          ))}
        </div>
      )}
      {isError && (
        <p className="text-sm text-brand-secondary">
          {t('studio.drafts.error')}
        </p>
      )}

      {!isLoading && !isError && projects.length === 0 && !unsaved && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 py-12 text-center">
          <Clapperboard size={32} className="text-white/30" aria-hidden />
          <p className="text-sm text-white/60">{t('studio.home.empty')}</p>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {unsaved && (
          <li className="relative">
            <button
              type="button"
              onClick={() => open(unsaved, null)}
              className="block w-full text-left"
            >
              <span className="flex aspect-9/16 w-full items-center justify-center rounded-2xl bg-white/5 ring-1 ring-brand-primary/40">
                <Clapperboard size={28} className="text-white/40" aria-hidden />
              </span>
              <span className="mt-2 block truncate text-sm font-semibold text-white">
                {unsaved.name}
              </span>
              <span className="block text-xs text-brand-primary-text">
                {t('studio.home.on_this_device')}
              </span>
            </button>
          </li>
        )}
        {projects.map(({ draft, studio }) => (
          <li key={draft.id} className="relative">
            <button
              type="button"
              onClick={() => open(studio, draft.id)}
              className="block w-full text-left"
            >
              <span className="relative block aspect-9/16 w-full overflow-hidden rounded-2xl bg-white/5">
                {draft.mediaUrl && (
                  <Thumbnail url={draft.mediaUrl} type={draft.mediaType} />
                )}
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-mono text-white">
                  {formatClock(projectContentEnd(studio))}
                </span>
              </span>
              <span className="mt-2 block truncate text-sm font-semibold text-white">
                {draft.name || studio.name || t('studio.default_project_name')}
              </span>
              <span className="block text-xs text-white/50">
                {formatDate(draft.updatedAt, i18n.language)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMenuFor(menuFor === draft.id ? null : draft.id)}
              aria-label={t('studio.home.options', {
                name: draft.name || studio.name,
              })}
              aria-expanded={menuFor === draft.id}
              className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
            >
              <MoreHorizontal size={18} aria-hidden />
            </button>
            {menuFor === draft.id && (
              <div className="absolute right-1 top-13 z-10 rounded-xl border border-white/10 bg-surface-elevated p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
                    setToDelete(draft.id);
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-secondary hover:bg-white/5"
                >
                  <Trash2 size={16} aria-hidden />
                  {t('studio.drafts.delete')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete);
          setToDelete(null);
        }}
        title={t('studio.drafts.delete')}
        message={t('studio.drafts.delete_confirm')}
        isDestructive
      />
    </div>
  );
}
