import { motion } from 'framer-motion';
import {
  Bookmark,
  EyeOff,
  Flag,
  Megaphone,
  Pencil,
  Trash2,
  UserX,
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
  onHidePost?: () => void;
  onHideAuthor?: () => void;
}

interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'highlight';
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
}: MenuItemProps) {
  const colorMap = {
    default: {
      icon: 'rgba(255,255,255,0.6)',
      text: 'white',
      hover: 'rgba(255,255,255,0.06)',
    },
    danger: {
      icon: 'rgba(248,113,113,0.9)',
      text: 'rgba(248,113,113,0.95)',
      hover: 'rgba(239,68,68,0.08)',
    },
    highlight: {
      icon: 'rgba(251,191,36,0.9)',
      text: 'white',
      hover: 'rgba(251,191,36,0.08)',
    },
  };
  const c = colorMap[variant];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
      style={{ color: c.text }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = c.hover;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${c.icon}12`, border: `1px solid ${c.icon}20` }}
      >
        <Icon size={14} style={{ color: c.icon }} />
      </span>
      <span className="font-medium tracking-tight">{label}</span>
    </motion.button>
  );
}

function MenuDivider() {
  return (
    <div className="mx-3 my-1">
      <div
        className="h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 40%, rgba(131,58,180,0.12) 60%, transparent 100%)',
        }}
      />
    </div>
  );
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
  onHidePost,
  onHideAuthor,
}: PostMenuProps) {
  const { t } = useTranslation();
  if (!showMenu) return null;

  return createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.92, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -6 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'fixed',
        top: menuPosition.top,
        right: menuPosition.right,
        zIndex: 9999,
        minWidth: '180px',
        background:
          'linear-gradient(160deg, rgba(18,12,32,0.96) 0%, rgba(10,8,20,0.98) 100%)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: '16px',
        boxShadow:
          '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(131,58,180,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
      className="py-2"
    >
      {isOwner ? (
        <>
          {onPromote && (
            <MenuItem
              icon={Megaphone}
              label={t('post.menu.promote', 'Boost Post')}
              onClick={onPromote}
              variant="highlight"
            />
          )}
          <MenuItem
            icon={Pencil}
            label={t('post.menu.edit')}
            onClick={onEdit}
          />
          <MenuDivider />
          <MenuItem
            icon={Trash2}
            label={t('post.menu.delete')}
            onClick={onDelete}
            variant="danger"
          />
        </>
      ) : (
        <>
          {onHidePost && (
            <MenuItem
              icon={EyeOff}
              label={t('post.menu.not_interested', 'Not interested')}
              onClick={onHidePost}
            />
          )}
          {onHideAuthor && (
            <MenuItem
              icon={UserX}
              label={t('post.menu.hide_author', 'Hide author')}
              onClick={onHideAuthor}
            />
          )}
          {onMute && (
            <MenuItem
              icon={VolumeX}
              label={t('post.menu.mute', 'Mute user')}
              onClick={onMute}
            />
          )}
          <MenuItem
            icon={Flag}
            label={t('post.menu.report')}
            onClick={onReport}
            variant="danger"
          />
        </>
      )}
      <MenuDivider />
      <MenuItem
        icon={Bookmark}
        label={t('post.menu.save')}
        onClick={onAddToCollection}
      />
    </motion.div>,
    document.body,
  );
}
