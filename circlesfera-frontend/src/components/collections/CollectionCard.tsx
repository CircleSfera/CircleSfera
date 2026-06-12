import { FolderHeart } from 'lucide-react';
import type { Collection } from '../../types';

interface CollectionCardProps {
  collection: Collection;
  onClick: () => void;
}

export default function CollectionCard({
  collection,
  onClick,
}: CollectionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer group relative aspect-square w-full appearance-none bg-transparent border-none p-0 text-left"
    >
      <div className="absolute inset-0 bg-white/5 rounded-2xl border border-white/10 overflow-hidden transition-transform duration-300 group-hover:scale-95">
        {collection.coverUrl ? (
          <img
            src={collection.coverUrl}
            alt={collection.name}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5 group-hover:bg-white/10 transition-colors">
            <FolderHeart
              size={48}
              className="text-white/20 group-hover:text-white/40 transition-colors"
            />
          </div>
        )}

        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent p-4 flex flex-col justify-end">
          <h3 className="text-white font-bold truncate">{collection.name}</h3>
          {collection._count && (
            <p className="text-white/60 text-xs font-medium">
              {collection._count.bookmarks} posts
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
