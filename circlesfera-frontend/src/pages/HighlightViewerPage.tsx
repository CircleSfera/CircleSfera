import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Images, Pencil, Trash2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { highlightsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import { useStoryStore } from '../stores/storyStore';
import type { Story } from '../types';

const CreateHighlightModal = lazy(
  () => import('../components/modals/CreateHighlightModal'),
);

export default function HighlightViewerPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const openStories = useStoryStore((state) => state.openStories);
  const closeStories = useStoryStore((state) => state.closeStories);
  const isStoryOpen = useStoryStore((state) => state.isOpen);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [isManageOpen, setIsManageOpen] = useState(false);
  const sawViewerOpen = useRef(false);

  const { data: highlight, isLoading } = useQuery({
    queryKey: ['highlight', id],
    queryFn: () => highlightsApi.getOne(id!).then((res) => res.data),
    enabled: !!id,
  });

  const isOwner =
    !!profile?.id &&
    !!highlight &&
    (highlight as { profileId?: string }).profileId === profile.id;

  const storyIds = useMemo(
    () =>
      (highlight?.stories || [])
        .map((hs: { story?: { id?: string } }) => hs.story?.id)
        .filter((storyId: string | undefined): storyId is string => !!storyId),
    [highlight?.stories],
  );

  const stories: Story[] = useMemo(
    () => (highlight?.stories || []).map((hs) => hs.story),
    [highlight?.stories],
  );

  useEffect(() => {
    if (stories.length === 0) return;
    openStories(stories, 0);
  }, [stories, openStories]);

  useEffect(() => {
    if (isStoryOpen) {
      sawViewerOpen.current = true;
      return;
    }
    if (sawViewerOpen.current) {
      navigate(-1);
    }
  }, [isStoryOpen, navigate]);

  useEffect(() => {
    return () => {
      closeStories();
    };
  }, [closeStories]);

  const updateMutation = useMutation({
    mutationFn: (data: { title?: string }) => highlightsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlight', id] });
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      toast.success(t('story.highlight_updated'));
      setEditingTitle(false);
    },
    onError: () => toast.error(t('story.highlight_update_error')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => highlightsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      toast.success(t('story.highlight_deleted'));
      navigate(-1);
    },
    onError: () => toast.error(t('story.highlight_delete_error')),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!highlight?.stories) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">
            {t('story.highlight_not_found')}
          </h2>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-white text-black rounded-full font-bold min-h-11"
          >
            {t('story.go_back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {isOwner && (
        <div className="fixed top-4 right-4 z-60 flex items-center gap-2">
          {editingTitle ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const next = title.trim();
                if (next) updateMutation.mutate({ title: next });
              }}
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-black/70 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
                placeholder={highlight.title}
              />
              <button
                type="submit"
                className="px-4 min-h-11 rounded-lg bg-white text-black text-xs font-bold flex items-center justify-center"
              >
                {t('common.save')}
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsManageOpen(true)}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-black/60 border border-white/10 text-white hover:bg-white/10"
                aria-label={t('modals.highlight.edit_highlight')}
              >
                <Images size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle(highlight.title || '');
                  setEditingTitle(true);
                }}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-black/60 border border-white/10 text-white hover:bg-white/10"
                aria-label={t('story.edit_highlight')}
              >
                <Pencil size={16} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('story.delete_highlight_confirm'))) {
                deleteMutation.mutate();
              }
            }}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-black/60 border border-white/10 text-red-400 hover:bg-red-500/20"
            aria-label={t('story.delete_highlight')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
      <Suspense fallback={null}>
        <CreateHighlightModal
          isOpen={isManageOpen}
          onClose={() => setIsManageOpen(false)}
          highlightId={id}
          initialTitle={highlight.title || ''}
          initialCoverUrl={highlight.coverUrl || null}
          initialStoryIds={storyIds}
        />
      </Suspense>
    </>
  );
}
