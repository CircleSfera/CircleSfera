import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { followsApi } from '../../services';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const blockMutation = useMutation({
    mutationFn: () => followsApi.block(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', username] });
      queryClient.invalidateQueries({ queryKey: ['follow', username] });
      onClose();
    },
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="sm"
      title={t('modals.block.title', { username })}
    >
      <div className="flex flex-col items-center text-center gap-4 -mt-2">
        <div className="p-4 rounded-full bg-red-500/10 text-red-500 ring-1 ring-white/10">
          <Ban size={28} strokeWidth={1.5} aria-hidden />
        </div>
        <p className="text-gray-300 text-sm leading-relaxed">
          {t('modals.block.message')}
        </p>
      </div>

      <div className="pt-4 flex gap-3">
        <Button
          onClick={onClose}
          variant="secondary"
          className="flex-1 min-h-11"
          disabled={blockMutation.isPending}
        >
          {t('modals.block.cancel')}
        </Button>
        <Button
          onClick={() => blockMutation.mutate()}
          isLoading={blockMutation.isPending}
          variant="danger"
          className="flex-1 min-h-11"
        >
          {t('modals.block.confirm')}
        </Button>
      </div>
    </Dialog>
  );
}
