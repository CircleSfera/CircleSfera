import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  ArchiveRestore,
  Bookmark,
  CirclePlus,
  EyeOff,
  Flag,
  Info,
  Megaphone,
  Pencil,
  Trash2,
  UserX,
  VolumeX,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useWideScreen } from '../../hooks/useWideScreen';
import { OptionRow, OptionsSheet } from '../sheets/OptionsSheet';

interface PostMenuProps {
  showMenu: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPosition: { top: number; right: number; placement?: 'above' | 'below' };
  isOwner: boolean;
  // Closes the menu: a tap on the shade behind the sheet, or its close.
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onAddToCollection: () => void;
  onPromote?: () => void;
  // The author's: archive it, or show an archived one on the profile again.
  onArchive?: () => void;
  isArchived?: boolean;
  onMute?: () => void;
  onHidePost?: () => void;
  onHideAuthor?: () => void;
  // Share it to one's story as a card of the original.
  onAddToStory?: () => void;
  // Why the post is shown to the viewer.
  onWhy?: () => void;
}

interface MenuItemProps {
  icon: LucideIcon;
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
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 40%, rgba(140, 82, 255,0.12) 60%, transparent 100%)',
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
  onClose,
  onEdit,
  onDelete,
  onReport,
  onAddToCollection,
  onPromote,
  onArchive,
  isArchived = false,
  onMute,
  onHidePost,
  onHideAuthor,
  onAddToStory,
  onWhy,
}: PostMenuProps) {
  const { t } = useTranslation();
  const wide = useWideScreen();
  if (!showMenu) return null;

  // One list for both: a sheet from the bottom on a phone, as Instagram's,
  // and a menu by the button on a wide screen. A null is a divider.
  const items: Array<MenuItemProps | null> = isOwner
    ? ([
        onPromote
          ? {
              icon: Megaphone,
              label: t('post.menu.promote'),
              onClick: onPromote,
              variant: 'highlight',
            }
          : undefined,
        { icon: Pencil, label: t('post.menu.edit'), onClick: onEdit },
        onArchive
          ? {
              icon: isArchived ? ArchiveRestore : Archive,
              label: isArchived
                ? t('post.menu.show_on_profile')
                : t('post.menu.archive'),
              onClick: onArchive,
            }
          : undefined,
        null,
        {
          icon: Trash2,
          label: t('post.menu.delete'),
          onClick: onDelete,
          variant: 'danger',
        },
      ].filter((item) => item !== undefined) as Array<MenuItemProps | null>)
    : ([
        onHidePost
          ? {
              icon: EyeOff,
              label: t('post.menu.not_interested'),
              onClick: onHidePost,
            }
          : undefined,
        onHideAuthor
          ? {
              icon: UserX,
              label: t('post.menu.hide_author'),
              onClick: onHideAuthor,
            }
          : undefined,
        onMute
          ? { icon: VolumeX, label: t('post.menu.mute'), onClick: onMute }
          : undefined,
        onWhy
          ? { icon: Info, label: t('post.why_seeing.open'), onClick: onWhy }
          : undefined,
        {
          icon: Flag,
          label: t('post.menu.report'),
          onClick: onReport,
          variant: 'danger',
        },
      ].filter((item) => item !== undefined) as Array<MenuItemProps | null>);
  items.push(null);
  if (onAddToStory) {
    items.push({
      icon: CirclePlus,
      label: t('post.menu.add_to_story'),
      onClick: onAddToStory,
    });
  }
  items.push({
    icon: Bookmark,
    label: t('post.menu.save'),
    onClick: onAddToCollection,
  });

  // Each divider is named by how many came before it.
  let dividers = 0;
  const entries = items.map((item) =>
    item ? { key: item.label, item } : { key: `divider-${dividers++}`, item },
  );

  if (!wide) {
    return (
      <OptionsSheet
        isOpen
        onClose={onClose}
        title={t('frames.options')}
        panelRef={menuRef}
      >
        <div className="px-2 pb-3 space-y-0.5">
          {entries.map(({ key, item }) =>
            item ? (
              <OptionRow key={key} {...item} />
            ) : (
              <div key={key} className="mx-2 my-1 h-px bg-white/10" />
            ),
          )}
        </div>
      </OptionsSheet>
    );
  }

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
        transform:
          menuPosition.placement === 'above'
            ? 'translateY(calc(-100% - 8px))'
            : undefined,
        zIndex: 9999,
        minWidth: '180px',
        background:
          'linear-gradient(160deg, rgba(18,12,32,0.96) 0%, rgba(10,8,20,0.98) 100%)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: '16px',
        boxShadow:
          '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(140, 82, 255,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
      className="py-2"
    >
      {entries.map(({ key, item }) =>
        item ? <MenuItem key={key} {...item} /> : <MenuDivider key={key} />,
      )}
    </motion.div>,
    document.body,
  );
}
