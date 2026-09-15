import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bookmarksApi, collectionsApi } from '../../services';
import FrameBottomSheet from '../frames/FrameBottomSheet';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

interface AddToCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  currentCollectionId?: string | null;
  presentation?: 'default' | 'frame';
}

function CollectionPickerBody({
  postId,
  currentCollectionId,
  onClose,
  compact,
}: {
  postId: string;
  currentCollectionId?: string | null;
  onClose: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const queryClient = useQueryClient();

  const { data: collections, isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: () => collectionsApi.getAll(),
  });

  const addToCollectionMutation = useMutation({
    mutationFn: (collectionId: string) =>
      bookmarksApi.updateCollection(postId, collectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedPosts'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarkCheck', postId] });
      queryClient.invalidateQueries({ queryKey: ['bookmark', postId] });
      onClose();
    },
  });

  const createAndAddMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await collectionsApi.create({ name });
      return bookmarksApi.updateCollection(postId, res.data.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['savedPosts'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarkCheck', postId] });
      queryClient.invalidateQueries({ queryKey: ['bookmark', postId] });
      onClose();
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;
    createAndAddMutation.mutate(newCollectionName);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div
      className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar ${
        compact ? 'px-2 pb-2' : 'max-h-[60vh]'
      }`}
    >
      <div className="space-y-0.5">
        {!isCreating ? (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className={`w-full flex items-center gap-2.5 rounded-xl text-left transition-colors text-brand-blue hover:bg-white/5 ${
              compact ? 'px-2 py-2' : 'p-3'
            }`}
          >
            <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center shrink-0">
              <Plus size={20} />
            </div>
            <span className="font-semibold text-sm">
              {t('collections.new_collection')}
            </span>
          </button>
        ) : (
          <form onSubmit={handleCreate} className="p-2 space-y-2">
            <input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder={t('collections.collection_name')}
              className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-primary/50"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setIsCreating(false)}
                variant="secondary"
                className="flex-1 h-11 font-semibold"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={!newCollectionName.trim()}
                isLoading={createAndAddMutation.isPending}
                variant="primary"
                className="flex-1 h-11 font-semibold"
              >
                {t('collections.create')}
              </Button>
            </div>
          </form>
        )}

        {collections?.data.map((collection) => (
          <button
            type="button"
            key={collection.id}
            onClick={() => addToCollectionMutation.mutate(collection.id)}
            className={`w-full flex items-center gap-2.5 rounded-xl text-left transition-colors hover:bg-white/5 ${
              compact ? 'px-2 py-2' : 'p-2'
            }`}
          >
            <div className="w-10 h-10 bg-white/5 rounded-lg overflow-hidden border border-white/5 shrink-0">
              {collection.coverUrl ? (
                <img
                  src={collection.coverUrl}
                  className="w-full h-full object-cover"
                  alt=""
                />
              ) : (
                <div className="w-full h-full bg-gray-800" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm truncate">
                {collection.name}
              </h3>
              <p className="text-white/40 text-xs">
                {t('collections.posts_count', {
                  count: collection._count?.bookmarks || 0,
                })}
              </p>
            </div>
            {currentCollectionId === collection.id && (
              <Check size={18} className="text-brand-blue shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AddToCollectionModal({
  isOpen,
  onClose,
  postId,
  currentCollectionId,
  presentation = 'default',
}: AddToCollectionModalProps) {
  const { t } = useTranslation();
  const isFrame = presentation === 'frame';

  if (isFrame) {
    if (!isOpen) return null;
    return (
      <FrameBottomSheet
        isOpen
        onClose={onClose}
        title={t('frames.save_to_collection')}
        maxHeightClass="max-h-[58%]"
      >
        <CollectionPickerBody
          postId={postId}
          currentCollectionId={currentCollectionId}
          onClose={onClose}
          compact
        />
      </FrameBottomSheet>
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="sm"
      title={t('frames.save_to_collection')}
      className="max-h-[90vh]"
    >
      <CollectionPickerBody
        postId={postId}
        currentCollectionId={currentCollectionId}
        onClose={onClose}
      />
    </Dialog>
  );
}
