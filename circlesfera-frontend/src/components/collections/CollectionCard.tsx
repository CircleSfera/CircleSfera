import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type { Collection } from '../../types';

export type CollectionRenamePayload = {
  name: string;
  description?: string | null;
};

interface CollectionCardProps {
  collection: Collection;
  onClick: () => void;
  onRename?: (
    id: string,
    payload: CollectionRenamePayload,
  ) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  canManage?: boolean;
}

export default function CollectionCard({
  collection,
  onClick,
  onRename,
  onDelete,
  canManage = false,
}: CollectionCardProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description || '');
  const [busy, setBusy] = useState(false);

  const resetRenameFields = () => {
    setName(collection.name);
    setDescription(collection.description || '');
    setRenaming(false);
  };

  const handleRename = async () => {
    if (!onRename || !name.trim()) {
      resetRenameFields();
      return;
    }
    const nextName = name.trim();
    const nextDescription = description.trim();
    const prevDescription = (collection.description || '').trim();
    if (nextName === collection.name && nextDescription === prevDescription) {
      setRenaming(false);
      return;
    }
    try {
      setBusy(true);
      await onRename(collection.id, {
        name: nextName,
        description: nextDescription || null,
      });
      toast.success(t('collections.renamed'));
      setRenaming(false);
    } catch {
      toast.error(t('collections.rename_error'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm(t('collections.delete_confirm'))) {
      return;
    }
    try {
      setBusy(true);
      await onDelete(collection.id);
      toast.success(t('collections.deleted'));
    } catch {
      toast.error(t('collections.delete_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative aspect-square w-full group">
      <button
        type="button"
        onClick={onClick}
        className="cursor-pointer absolute inset-0 appearance-none bg-transparent border-none p-0 text-left"
      >
        <div className="absolute inset-0 bg-white/5 rounded-lg border border-white/10 overflow-hidden transition-transform duration-300 group-hover:scale-95">
          {collection.coverUrl ? (
            <img
              src={collection.coverUrl}
              alt={collection.name}
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5 group-hover:bg-white/10 transition-colors">
              <span className="text-white/30 text-4xl font-black">
                {collection.name.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}

          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent p-4 flex flex-col justify-end">
            {renaming ? (
              // biome-ignore lint/a11y/noStaticElementInteractions: stop card navigation while renaming
              <div
                className="space-y-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRename();
                    if (e.key === 'Escape') resetRenameFields();
                  }}
                  maxLength={100}
                  className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-sm text-white font-bold"
                  disabled={busy}
                  aria-label={t('collections.collection_name')}
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') resetRenameFields();
                  }}
                  maxLength={300}
                  rows={2}
                  placeholder={t('collections.placeholder_description')}
                  className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-xs text-white/90 resize-none"
                  disabled={busy}
                  aria-label={t('collections.description_label')}
                />
              </div>
            ) : (
              <>
                <h3 className="text-white font-bold truncate">
                  {collection.name}
                </h3>
                {collection.description ? (
                  <p className="text-white/50 text-xs line-clamp-2 mt-0.5">
                    {collection.description}
                  </p>
                ) : null}
              </>
            )}
            {collection._count && (
              <p className="text-white/60 text-xs font-medium">
                {t('collections.posts_count', {
                  count: collection._count.bookmarks,
                })}
              </p>
            )}
          </div>
        </div>
      </button>

      {canManage && (
        <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              if (renaming) void handleRename();
              else {
                setName(collection.name);
                setDescription(collection.description || '');
                setRenaming(true);
              }
            }}
            className="p-1.5 rounded-lg bg-black/60 border border-white/10 text-white hover:bg-white/10"
            aria-label={t('collections.rename')}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void handleDelete();
            }}
            className="p-1.5 rounded-lg bg-black/60 border border-white/10 text-red-400 hover:bg-red-500/20"
            aria-label={t('collections.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
