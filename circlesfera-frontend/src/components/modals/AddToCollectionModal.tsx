import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { bookmarksApi, collectionsApi } from '../../services';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';

interface AddToCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  currentCollectionId?: string | null;
}

export default function AddToCollectionModal({
  isOpen,
  onClose,
  postId,
  currentCollectionId,
}: AddToCollectionModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const queryClient = useQueryClient();

  const { data: collections, isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: () => collectionsApi.getAll(),
    enabled: isOpen,
  });

  const addToCollectionMutation = useMutation({
    mutationFn: (collectionId: string) =>
      bookmarksApi.updateCollection(postId, collectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedPosts'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarkCheck', postId] });
      onClose();
    },
  });

  const createAndAddMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await collectionsApi.create(name);
      return bookmarksApi.updateCollection(postId, res.data.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['savedPosts'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarkCheck', postId] });
      onClose();
    },
  });

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;
    createAndAddMutation.mutate(newCollectionName);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-surface-raised w-full max-w-sm rounded-lg border border-white/10 overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Save to Collection</h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 rounded-full"
          >
            <X size={20} />
          </Button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="space-y-1">
              {/* Create New Option */}
              {!isCreating ? (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-left transition-colors text-blue-400 group"
                >
                  <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                    <Plus size={24} />
                  </div>
                  <span className="font-semibold">New Collection</span>
                </button>
              ) : (
                <form onSubmit={handleCreate} className="p-2">
                  <input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Collection Name"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors mb-2"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setIsCreating(false)}
                      variant="secondary"
                      className="flex-1 py-2 font-semibold"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!newCollectionName.trim()}
                      isLoading={createAndAddMutation.isPending}
                      variant="primary"
                      className="flex-1 py-2 font-semibold"
                    >
                      Create
                    </Button>
                  </div>
                </form>
              )}

              {/* Check if user wants to remove from collection (add to 'All Posts' only?) */}
              {/* Actually, standard behavior: Click existing collection to move/add. 
                        If we support multiple collections, checkboxes. 
                        Since we support 1 collection:
                    */}

              {collections?.data.map((collection) => (
                <button
                  type="button"
                  key={collection.id}
                  onClick={() => addToCollectionMutation.mutate(collection.id)}
                  className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl text-left transition-colors group"
                >
                  <div className="w-12 h-12 bg-white/5 rounded-lg overflow-hidden relative border border-white/5">
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
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">
                      {collection.name}
                    </h3>
                    <p className="text-white/40 text-xs">
                      {collection._count?.bookmarks || 0} posts
                    </p>
                  </div>
                  {currentCollectionId === collection.id && (
                    <Check size={20} className="text-blue-500" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
