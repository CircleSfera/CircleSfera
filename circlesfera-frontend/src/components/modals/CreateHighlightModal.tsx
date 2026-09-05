import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Image as ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { highlightsApi, storiesApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import type { Story } from '../../types';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

interface CreateHighlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  // When set, modal edits an existing highlight (stories + cover + title).
  highlightId?: string;
  initialTitle?: string;
  initialCoverUrl?: string | null;
  initialStoryIds?: string[];
}

export default function CreateHighlightModal({
  isOpen,
  onClose,
  highlightId,
  initialTitle = '',
  initialCoverUrl = null,
  initialStoryIds = [],
}: CreateHighlightModalProps) {
  const { t } = useTranslation();
  const profile = useAuthStore((state) => state.profile);
  const queryClient = useQueryClient();
  const isEditing = !!highlightId;
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverStoryId, setCoverStoryId] = useState<string | null>(null);
  const initialStoryKey = initialStoryIds.join(',');

  // Reset draft when the modal opens or the highlight/story set identity changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialStoryKey stands in for initialStoryIds identity
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setTitle(initialTitle);
    setCoverUrl(initialCoverUrl);
    setSelectedStoryIds(initialStoryIds);
    setCoverStoryId(initialStoryIds[0] || null);
  }, [isOpen, highlightId, initialTitle, initialCoverUrl, initialStoryKey]);

  const { data: storiesResponse, isLoading } = useQuery({
    queryKey: ['my-archive'],
    queryFn: () => storiesApi.getArchive().then((res) => res.data),
    enabled: isOpen && !!profile,
  });

  const stories = storiesResponse || [];

  const resetAndClose = () => {
    setStep(1);
    setSelectedStoryIds([]);
    setTitle('');
    setCoverUrl(null);
    setCoverStoryId(null);
    onClose();
  };

  const invalidateHighlightQueries = () => {
    queryClient.invalidateQueries({
      queryKey: ['userHighlights', profile?.username],
    });
    if (highlightId) {
      queryClient.invalidateQueries({ queryKey: ['highlight', highlightId] });
    }
    queryClient.invalidateQueries({ queryKey: ['highlights'] });
  };

  const createHighlightMutation = useMutation({
    mutationFn: highlightsApi.create,
    onSuccess: () => {
      invalidateHighlightQueries();
      resetAndClose();
    },
  });

  const updateHighlightMutation = useMutation({
    mutationFn: (data: {
      title: string;
      coverUrl?: string;
      storyIds: string[];
    }) => highlightsApi.update(highlightId!, data),
    onSuccess: () => {
      invalidateHighlightQueries();
      resetAndClose();
    },
  });

  const resolveCoverUrl = () => {
    const coverId = coverStoryId || selectedStoryIds[0];
    if (coverId) {
      const coverStory = stories.find((s: Story) => s.id === coverId);
      if (coverStory) return coverStory.url;
    }
    return coverUrl || undefined;
  };

  const toggleStorySelection = (storyId: string) => {
    setSelectedStoryIds((prev) => {
      const next = prev.includes(storyId)
        ? prev.filter((id) => id !== storyId)
        : [...prev, storyId];
      if (coverStoryId === storyId && !next.includes(storyId)) {
        setCoverStoryId(next[0] || null);
      } else if (!coverStoryId && next.length > 0) {
        setCoverStoryId(next[0]);
      }
      return next;
    });
  };

  const handleSave = () => {
    if (!title.trim() || selectedStoryIds.length === 0) return;
    const payload = {
      title: title.trim(),
      storyIds: selectedStoryIds,
      coverUrl: resolveCoverUrl(),
    };
    if (isEditing) {
      updateHighlightMutation.mutate(payload);
    } else {
      createHighlightMutation.mutate(payload);
    }
  };

  if (!isOpen) return null;

  const isPending =
    createHighlightMutation.isPending || updateHighlightMutation.isPending;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={resetAndClose}
      maxWidth="md"
      className="max-h-[90vh]"
    >
      <div className="-mx-4 -mt-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {step === 2 && (
              <Button
                onClick={() => setStep(1)}
                variant="ghost"
                size="icon"
                className="text-white hover:text-gray-300 shrink-0"
                aria-label={t('common.back', 'Back')}
              >
                <ChevronLeft size={24} />
              </Button>
            )}
            <h2 className="text-lg font-bold text-white truncate">
              {step === 1
                ? isEditing
                  ? t('modals.highlight.edit_highlight', 'Edit highlight')
                  : t('modals.highlight.new_highlight')
                : t('modals.highlight.title_and_cover')}
            </h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {step === 1 ? (
            <div className="space-y-4">
              <p className="text-gray-300 text-sm">
                {t('modals.highlight.select_stories_desc')}
              </p>

              {isLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : stories.length > 0 ? (
                <div className="grid grid-cols-3 gap-1">
                  {stories.map((story: Story) => {
                    const isSelected = selectedStoryIds.includes(story.id);
                    return (
                      <button
                        type="button"
                        key={story.id}
                        className={`relative aspect-9/16 cursor-pointer group appearance-none bg-transparent p-0 border-none w-full ${isSelected ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                        onClick={() => toggleStorySelection(story.id)}
                      >
                        <img
                          src={story.url}
                          alt="Story"
                          className="w-full h-full object-cover rounded-md"
                        />
                        <div
                          className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-white/50 bg-black/20'}`}
                        >
                          {isSelected && (
                            <Check size={14} className="text-white" />
                          )}
                        </div>
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors pointer-events-none" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-500">
                  <p>{t('modals.highlight.no_stories')}</p>
                  <p className="text-xs mt-1">
                    {t('modals.highlight.post_some_stories')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8">
              <button
                type="button"
                className="relative group cursor-pointer appearance-none bg-transparent p-0 border-none"
                onClick={() => {
                  if (selectedStoryIds.length === 0) return;
                  const currentIndex = selectedStoryIds.indexOf(
                    coverStoryId || selectedStoryIds[0],
                  );
                  const nextId =
                    selectedStoryIds[
                      (currentIndex + 1) % selectedStoryIds.length
                    ];
                  setCoverStoryId(nextId);
                  const nextStory = stories.find((s: Story) => s.id === nextId);
                  if (nextStory) setCoverUrl(nextStory.url);
                }}
              >
                <div className="w-24 h-24 rounded-full border-2 border-gray-600 overflow-hidden relative">
                  {(() => {
                    let previewUrl = coverUrl;
                    if (!previewUrl && selectedStoryIds.length > 0) {
                      const s = stories.find(
                        (store: Story) =>
                          store.id === (coverStoryId || selectedStoryIds[0]),
                      );
                      if (s) previewUrl = s.url;
                    }

                    return previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Cover"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <ImageIcon className="text-gray-500" />
                      </div>
                    );
                  })()}
                </div>
              </button>

              <div className="w-full">
                <input
                  type="text"
                  placeholder={t('modals.highlight.highlight_name')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-transparent text-center text-white text-xl placeholder:text-gray-600 border-b border-gray-700 py-2 focus:outline-none focus:border-white transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end shrink-0">
          {step === 1 ? (
            <Button
              onClick={() => setStep(2)}
              disabled={selectedStoryIds.length === 0}
              variant="primary"
              className="px-6 py-2 font-semibold"
            >
              {t('modals.highlight.next')}
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={!title.trim() || selectedStoryIds.length === 0}
              isLoading={isPending}
              variant="primary"
              className="px-6 py-2 font-semibold"
            >
              {isEditing
                ? t('modals.highlight.save_changes', 'Save changes')
                : t('modals.highlight.done')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
