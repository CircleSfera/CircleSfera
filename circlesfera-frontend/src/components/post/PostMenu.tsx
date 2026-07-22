import { motion } from 'framer-motion';
import {
  Bookmark,
  Flag,
  Megaphone,
  Pencil,
  Trash2,
  VolumeX,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface PostMenuProps {
  showMenu: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPosition: { top: number; right: number };
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onAddToCollection: () => void;
  onPromote?: () => void;
  onMute?: () => void;
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
  onPromote,
  onMute,
}: PostMenuProps) {
  const { t } = useTranslation();
  if (!showMenu) return null;

  return createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'fixed',
        top: menuPosition.top,
        right: menuPosition.right,
        zIndex: 9999,
      }}
      className="py-2 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] min-w-[150px] overflow-hidden"
    >
      {isOwner ? (
        <>
          {onPromote && (
            <button
              type="button"
              onClick={onPromote}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Megaphone size={16} className="text-yellow-400" />
              <span>{t('post.menu.promote', 'Boost Post')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <Pencil size={16} />
            <span>{t('post.menu.edit')}</span>
          </button>
          <div className="mx-3 my-1 border-t border-white/5" />
          <button
            type="button"
            onClick={onDelete}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <Trash2 size={16} />
            <span>{t('post.menu.delete')}</span>
          </button>
        </>
      ) : (
        <>
          {onMute && (
            <button
              type="button"
              onClick={onMute}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <VolumeX size={16} />
              <span>{t('post.menu.mute', 'Mute user')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onReport}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <Flag size={16} />
            <span>{t('post.menu.report')}</span>
          </button>
        </>
      )}
      <div className="mx-3 my-1 border-t border-white/5" />
      <button
        type="button"
        onClick={onAddToCollection}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 active:bg-white/10 transition-colors"
      >
        <Bookmark size={16} />
        <span>{t('post.menu.save')}</span>
      </button>
    </motion.div>,
    document.body,
  );
}
