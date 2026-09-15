import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import {
  Clapperboard,
  Grid,
  PlusCircle,
  Radio,
  Star,
  Users,
  Wand2,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';

type MenuItem = {
  id: string;
  icon: typeof Grid;
  label: string;
  badge?: string;
  action: () => void;
  primary?: boolean;
};

export default function CreateBottomSheet() {
  const { isCreateMenuOpen, closeCreateMenu } = useUIStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dragControls = useDragControls();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCreateMenuOpen) closeCreateMenu();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateMenuOpen, closeCreateMenu]);

  useEffect(() => {
    if (isCreateMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isCreateMenuOpen]);

  const handleNavigation = (path: string) => {
    closeCreateMenu();
    navigate(path);
  };

  const primaryItems: MenuItem[] = [
    {
      id: 'post',
      icon: Grid,
      label: t('create_menu.post'),
      action: () => handleNavigation('/create?mode=post'),
      primary: true,
    },
    {
      id: 'frame',
      icon: Clapperboard,
      label: t('create_menu.frame'),
      action: () => handleNavigation('/create?mode=frame'),
      primary: true,
    },
    {
      id: 'story',
      icon: PlusCircle,
      label: t('create_menu.story'),
      action: () => handleNavigation('/create?mode=story'),
      primary: true,
    },
    {
      id: 'circle',
      icon: Users,
      label: t('create_menu.circle'),
      action: () => handleNavigation('/create?mode=circle'),
      primary: true,
    },
  ];

  const secondaryItems: MenuItem[] = [
    {
      id: 'live',
      icon: Radio,
      label: t('create_menu.live'),
      action: () => handleNavigation('/live/broadcast'),
    },
    {
      id: 'highlights',
      icon: Star,
      label: t('create_menu.highlights'),
      action: () => {
        closeCreateMenu();
        useUIStore.getState().openCreateHighlight();
      },
    },
    {
      id: 'studio',
      icon: Wand2,
      label: t('create_menu.studio'),
      badge: t('create_menu.new'),
      action: () => handleNavigation('/edits'),
    },
  ];

  const cardStyle = (id: string) => {
    let bgGlow = 'bg-white/5';
    let iconColor = 'text-white/90';
    let borderHover = 'hover:border-white/20';

    if (id === 'post') {
      bgGlow = 'bg-linear-to-br from-brand-primary/20 to-purple-600/10';
      iconColor = 'text-purple-400';
      borderHover = 'hover:border-purple-500/50';
    } else if (id === 'story') {
      bgGlow = 'bg-linear-to-br from-pink-500/20 to-orange-500/10';
      iconColor = 'text-pink-400';
      borderHover = 'hover:border-pink-500/50';
    } else if (id === 'frame') {
      bgGlow = 'bg-linear-to-br from-blue-500/20 to-cyan-500/10';
      iconColor = 'text-blue-400';
      borderHover = 'hover:border-blue-500/50';
    } else if (id === 'studio') {
      bgGlow = 'bg-linear-to-br from-emerald-500/20 to-teal-500/10';
      iconColor = 'text-emerald-400';
      borderHover = 'hover:border-emerald-500/50';
    } else if (id === 'circle') {
      bgGlow = 'bg-linear-to-br from-amber-500/20 to-orange-600/10';
      iconColor = 'text-amber-400';
      borderHover = 'hover:border-amber-500/50';
    } else if (id === 'live') {
      bgGlow = 'bg-linear-to-br from-red-500/15 to-rose-600/10';
      iconColor = 'text-red-400';
      borderHover = 'hover:border-red-500/40';
    } else if (id === 'highlights') {
      bgGlow = 'bg-linear-to-br from-yellow-500/15 to-amber-600/10';
      iconColor = 'text-yellow-400';
      borderHover = 'hover:border-yellow-500/40';
    }

    return { bgGlow, iconColor, borderHover };
  };

  const renderItem = (item: MenuItem, compact = false) => {
    const { bgGlow, iconColor, borderHover } = cardStyle(item.id);
    return (
      <button
        type="button"
        key={item.id}
        onClick={item.action}
        className={`relative flex flex-col items-center gap-2 rounded-xl md:rounded-2xl border border-white/5 transition-all duration-300 group hover:bg-white/10 active:scale-95 ${bgGlow} ${borderHover} ${
          compact ? 'p-3 md:p-4' : 'p-3.5 md:p-5'
        }`}
      >
        <div className="relative">
          <div
            className={`absolute -inset-2 bg-current opacity-20 blur-xl rounded-full transition-opacity group-hover:opacity-40 ${iconColor}`}
          />
          <item.icon
            size={compact ? 22 : 26}
            className={`relative z-10 transition-transform group-hover:scale-110 md:w-8 md:h-8 ${iconColor}`}
            strokeWidth={1.5}
          />
        </div>

        <span
          className={`font-semibold text-white mt-0.5 ${
            compact ? 'text-[11px] md:text-sm' : 'text-xs md:text-[15px]'
          }`}
        >
          {item.label}
        </span>

        {item.badge && (
          <span className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.5)]">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <AnimatePresence>
      {isCreateMenuOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm"
            onClick={closeCreateMenu}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                closeCreateMenu();
              }
            }}
            className="fixed bottom-0 left-0 right-0 z-101 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-t-4xl md:top-0 md:bottom-0 md:h-fit md:m-auto md:max-w-md md:rounded-4xl shadow-[0_0_40px_rgba(140, 82, 255,0.2)] overflow-hidden flex flex-col max-h-[85vh]"
            data-testid="create-bottom-sheet"
          >
            <div
              className="w-full flex md:hidden justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-10 h-1.5 bg-white/20 rounded-full" />
            </div>

            <div className="text-center pb-3 md:pt-4 border-b border-white/10">
              <h2 className="text-white font-bold text-lg">
                {t('create_menu.title')}
              </h2>
            </div>

            <div className="overflow-y-auto overscroll-contain px-3.5 pt-4 pb-6 md:pb-10 space-y-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/35 px-1 mb-2.5">
                  {t('create_menu.section_content')}
                </p>
                <div className="grid grid-cols-2 gap-2.5 md:gap-3">
                  {primaryItems.map((item) => renderItem(item))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/35 px-1 mb-2.5">
                  {t('create_menu.section_more')}
                </p>
                <div className="grid grid-cols-3 gap-2 md:gap-2.5">
                  {secondaryItems.map((item) => renderItem(item, true))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
