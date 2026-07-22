import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import StoryViewer from '../components/StoryViewer';
import { highlightsApi } from '../services';
import { useAuthStore } from '../stores/authStore';

export default function HighlightViewerPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuthStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');

  const { data: highlight, isLoading } = useQuery({
    queryKey: ['highlight', id],
    queryFn: () => highlightsApi.getOne(id!).then((res) => res.data),
    enabled: !!id,
  });

  const isOwner =
    !!profile?.userId &&
    !!highlight &&
    (highlight as { userId?: string }).userId === profile.userId;

  const updateMutation = useMutation({
    mutationFn: (data: { title?: string }) => highlightsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlight', id] });
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      toast.success(t('story.highlight_updated', 'Highlight updated'));
      setEditingTitle(false);
    },
    onError: () =>
      toast.error(t('story.highlight_update_error', 'Could not update')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => highlightsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      toast.success(t('story.highlight_deleted', 'Highlight deleted'));
      navigate(-1);
    },
    onError: () =>
      toast.error(t('story.highlight_delete_error', 'Could not delete')),
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
            className="px-6 py-2 bg-white text-black rounded-full font-bold"
          >
            {t('story.go_back')}
          </button>
        </div>
      </div>
    );
  }

  const stories = highlight.stories.map((hs: any) => hs.story);

  return (
    <>
      {isOwner && (
        <div className="fixed top-4 right-4 z-[60] flex items-center gap-2">
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
                className="bg-black/70 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white"
                placeholder={highlight.title}
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold"
              >
                {t('common.save', 'Save')}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitle(highlight.title || '');
                setEditingTitle(true);
              }}
              className="p-2 rounded-full bg-black/60 border border-white/10 text-white hover:bg-white/10"
              aria-label={t('story.edit_highlight', 'Edit highlight')}
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  t('story.delete_highlight_confirm', 'Delete this highlight?'),
                )
              ) {
                deleteMutation.mutate();
              }
            }}
            className="p-2 rounded-full bg-black/60 border border-white/10 text-red-400 hover:bg-red-500/20"
            aria-label={t('story.delete_highlight', 'Delete highlight')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
      <StoryViewer
        stories={stories}
        initialIndex={0}
        onClose={() => navigate(-1)}
      />
    </>
  );
}
