import { Bookmark, Flag, Pencil, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';

interface PostMenuProps {
  showMenu: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPosition: { top: number; right: number };
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onAddToCollection: () => void;
}

export default function PostMenu({
  showMenu,
  menuRef,
  menuPosition,
  isOwner,
  onEdit,
  onDelete,
  onReport,
  onAddToCollection,
}: PostMenuProps) {
  if (!showMenu) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: menuPosition.top,
        right: menuPosition.right,
        zIndex: 9999,
      }}
      className="py-2 bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl min-w-[140px]"
    >
      {isOwner ? (
        <>
          <button
            type="button"
            onClick={onEdit}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-zinc-700 transition-colors"
          >
            <Pencil size={16} />
            <span>Edit</span>
          </button>
          <div className="mx-3 my-1 border-t border-zinc-600" />
          <button
            type="button"
            onClick={onDelete}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
          >
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onReport}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
        >
          <Flag size={16} />
          <span>Report</span>
        </button>
      )}
      <div className="mx-3 my-1 border-t border-zinc-600" />
      <button
        type="button"
        onClick={onAddToCollection}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-zinc-700 transition-colors"
      >
        <Bookmark size={16} />
        <span>Save to Collection</span>
      </button>
    </div>,
    document.body,
  );
}
