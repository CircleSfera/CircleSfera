import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collectionsApi } from '../../services';
import { Button } from '../ui';

interface CreateCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateCollectionModal({
  isOpen,
  onClose,
}: CreateCollectionModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (name: string) => collectionsApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setName('');
      onClose();
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate(name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-surface-raised w-full max-w-sm rounded-lg border border-white/10 overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {t('collections.new_collection')}
          </h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 rounded-full"
          >
            <X size={20} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              htmlFor="collectionName"
              className="block text-sm font-medium text-gray-400 mb-2"
            >
              {t('collections.collection_name')}
            </label>
            <input
              id="collectionName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('collections.placeholder_name')}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <Button
            type="submit"
            disabled={!name.trim()}
            isLoading={mutation.isPending}
            variant="primary"
            className="w-full py-3 bg-white text-black font-bold hover:bg-gray-200 border-transparent"
          >
            {t('collections.create')}
          </Button>
        </form>
      </div>
    </div>
  );
}
