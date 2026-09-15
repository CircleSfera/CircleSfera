import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collectionsApi } from '../../services';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

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
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      collectionsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setName('');
      setDescription('');
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const trimmedDescription = description.trim();
    mutation.mutate({
      name: name.trim(),
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="sm"
      title={t('collections.new_collection')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="collectionName"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            {t('collections.collection_name')}
          </label>
          <input
            id="collectionName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('collections.placeholder_name')}
            maxLength={100}
            className="w-full min-h-11 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-brand-primary transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="collectionDescription"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            {t('collections.description_label')}
          </label>
          <textarea
            id="collectionDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('collections.placeholder_description')}
            maxLength={300}
            rows={3}
            className="w-full min-h-20 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-brand-primary transition-colors resize-y"
          />
        </div>

        <Button
          type="submit"
          disabled={!name.trim()}
          isLoading={mutation.isPending}
          variant="primary"
          className="w-full min-h-11 font-bold"
        >
          {t('collections.create')}
        </Button>
      </form>
    </Dialog>
  );
}
