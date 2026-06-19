import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Image as ImageIcon, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { highlightsApi, storiesApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import type { Story } from '../../types';
import { Button } from '../ui';

interface CreateHighlightModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateHighlightModal({
  isOpen,
  onClose,
}: CreateHighlightModalProps) {
  const { t } = useTranslation();
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverStoryId, setCoverStoryId] = useState<string | null>(null);

  const { data: storiesResponse, isLoading } = useQuery({
    queryKey: ['my-archive'],
    queryFn: () => storiesApi.getArchive().then((res) => res.data),
    enabled: isOpen && !!profile,
  });

  const stories = storiesResponse || [];

  const createHighlightMutation = useMutation({
    mutationFn: highlightsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['userHighlights', profile?.username],
      });
      handleClose();
    },
  });

  const handleClose = () => {
    setStep(1);
    setSelectedStoryIds([]);
    setTitle('');
    setCoverUrl(null);
    onClose();
  };

  const toggleStorySelection = (storyId: string) => {
    setSelectedStoryIds((prev) =>
      prev.includes(storyId)
        ? prev.filter((id) => id !== storyId)
        : [...prev, storyId],
    );
  };

  const handleCreate = () => {
    if (!title.trim()) return;

    // Default cover to the first selected story's media if not set
    let finalCoverUrl = coverUrl;
    if (!finalCoverUrl && selectedStoryIds.length > 0) {
      const firstStory = stories.find(
        (s: Story) => s.id === selectedStoryIds[0],
      );
      if (firstStory) {
        finalCoverUrl = firstStory.url;
      }
    }

    createHighlightMutation.mutate({
      title,
      storyIds: selectedStoryIds,
      coverUrl: finalCoverUrl || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#262626] rounded-xl w-full max-w-md h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <Button
                onClick={() => setStep(1)}
                variant="ghost"
                size="icon"
                className="text-white hover:text-gray-300"
              >
                <ChevronLeft size={24} />
              </Button>
            )}
            <h2 className="text-lg font-bold text-white">
              {step === 1
                ? t('modals.highlight.new_highlight')
                : t('modals.highlight.title_and_cover')}
            </h2>
          </div>
          <Button
            onClick={handleClose}
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-white"
          >
            <X size={24} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 1 ? (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">
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
              {/* Cover Preview */}
              <button
                type="button"
                className="relative group cursor-pointer appearance-none bg-transparent p-0 border-none"
                onClick={() => {
                  const nextId =
                    selectedStoryIds[
                      (selectedStoryIds.indexOf(coverStoryId || '') + 1) %
                        selectedStoryIds.length
                    ];
                  setCoverStoryId(nextId);
                }}
              >
                <div className="w-24 h-24 rounded-full border-2 border-gray-600 overflow-hidden relative">
                  {(() => {
                    // Determine cover to show
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

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end">
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
              onClick={handleCreate}
              disabled={!title.trim()}
              isLoading={createHighlightMutation.isPending}
              variant="primary"
              className="px-6 py-2 font-semibold"
            >
              {t('modals.highlight.done')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
