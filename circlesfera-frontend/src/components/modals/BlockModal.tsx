import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, X } from 'lucide-react';
import { followsApi } from '../../services';
import { Button } from '../ui';

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
      <div className="bg-surface-high w-full max-w-md rounded-xl border border-white/10 shadow-2xl overflow-hidden scale-in-center animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Ban className="text-red-500" size={20} />
            Block {username}?
          </h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-gray-300 hover:text-white"
          >
            <X size={20} />
          </Button>
        </div>

        <div className="p-6 text-center">
          <p className="text-gray-300 mb-6">
            They won't be able to find your profile, posts, or story on
            CircleSfera. They won't be notified that you blocked them.
          </p>

          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="secondary"
              className="flex-1 py-3"
            >
              Cancel
            </Button>
            <Button
              onClick={() => blockMutation.mutate()}
              isLoading={blockMutation.isPending}
              variant="danger"
              className="flex-1 py-3"
            >
              Block
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
