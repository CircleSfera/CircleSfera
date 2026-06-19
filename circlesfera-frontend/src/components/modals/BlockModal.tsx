import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, X } from 'lucide-react';
import { followsApi } from '../../services';

interface BlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

export default function BlockModal({
  isOpen,
  onClose,
  username,
}: BlockModalProps) {
  const queryClient = useQueryClient();

  const blockMutation = useMutation({
    mutationFn: () => followsApi.block(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', username] });
      queryClient.invalidateQueries({ queryKey: ['follow', username] });
      onClose();
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#262626] w-full max-w-md rounded-xl border border-white/10 shadow-2xl overflow-hidden scale-in-center animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Ban className="text-red-500" size={20} />
            Block {username}?
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 text-center">
          <p className="text-gray-300 mb-6">
            They won't be able to find your profile, posts, or story on
            CircleSfera. They won't be notified that you blocked them.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => blockMutation.mutate()}
              disabled={blockMutation.isPending}
              className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {blockMutation.isPending ? 'Blocking...' : 'Block'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
