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

export default function CreateBottomSheet() {
  const { isCreateMenuOpen, closeCreateMenu } = useUIStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dragControls = useDragControls();

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCreateMenuOpen) closeCreateMenu();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateMenuOpen, closeCreateMenu]);

  // Lock body scroll when open
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

  const menuItems = [
    {
      id: 'frame',
      icon: Clapperboard,
      label: t('create_menu.frame', 'Frame'),
      action: () => handleNavigation('/create?mode=frame'),
    },
    {
      id: 'studio',
      icon: Wand2,
      label: t('create_menu.studio', 'Studio'),
      badge: t('create_menu.new', 'Nuevo'),
      action: () => handleNavigation('/edits'),
    },
    {
      id: 'post',
      icon: Grid,
      label: t('create_menu.post', 'Publicación'),
      action: () => handleNavigation('/create'),
    },
    {
      id: 'story',
      icon: PlusCircle,
      label: t('create_menu.story', 'Historia'),
      action: () => handleNavigation('/create?mode=story'),
    },
    {
      id: 'highlights',
      icon: Star,
      label: t('create_menu.highlights', 'Destacadas'),
      action: () => handleNavigation('/profile?action=highlights'),
    },
    {
      id: 'live',
      icon: Radio,
      label: t('create_menu.live', 'Directo'),
      action: () => handleNavigation('/live/broadcast'),
    },
    {
      id: 'circle',
      icon: Users,
      label: t('create_menu.circle', 'Círculo'),
      action: () => handleNavigation('/create?mode=circle'),
    },
  ];

  return (
    <AnimatePresence>
      {isCreateMenuOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm"
            onClick={closeCreateMenu}
          />

          {/* Bottom Sheet */}
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
            className="fixed bottom-0 left-0 right-0 z-101 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-t-[32px] md:top-0 md:bottom-0 md:h-fit md:m-auto md:max-w-md md:rounded-[32px] shadow-[0_0_40px_rgba(131,58,180,0.2)] overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Drag Handle Area */}
            <div
              className="w-full flex md:hidden justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-10 h-1.5 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="text-center pb-4 md:pt-4 border-b border-white/10">
              <h2 className="text-white font-bold text-lg">
                {t('create_menu.title', 'Crear')}
              </h2>
            </div>

            {/* Menu Items (Action Cards Grid) */}
            <div className="overflow-y-auto overscroll-contain px-4 pt-6 pb-8 md:pb-10">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {menuItems.map((item) => {
                  // Determine specific card styling based on item.id
                  let bgGlow = 'bg-white/5';
                  let iconColor = 'text-white/90';
                  let borderHover = 'hover:border-white/20';

                  if (item.id === 'post') {
                    bgGlow =
                      'bg-linear-to-br from-brand-primary/20 to-purple-600/10';
                    iconColor = 'text-purple-400';
                    borderHover = 'hover:border-purple-500/50';
                  } else if (item.id === 'story') {
                    bgGlow =
                      'bg-linear-to-br from-pink-500/20 to-orange-500/10';
                    iconColor = 'text-pink-400';
                    borderHover = 'hover:border-pink-500/50';
                  } else if (item.id === 'frame') {
                    bgGlow = 'bg-linear-to-br from-blue-500/20 to-cyan-500/10';
                    iconColor = 'text-blue-400';
                    borderHover = 'hover:border-blue-500/50';
                  } else if (item.id === 'studio') {
                    bgGlow =
                      'bg-linear-to-br from-emerald-500/20 to-teal-500/10';
                    iconColor = 'text-emerald-400';
                    borderHover = 'hover:border-emerald-500/50';
                  } else if (item.id === 'circle') {
                    bgGlow =
                      'bg-linear-to-br from-amber-500/20 to-orange-600/10';
                    iconColor = 'text-amber-400';
                    borderHover = 'hover:border-amber-500/50';
                  }

                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={item.action}
                      className={`relative flex flex-col items-center gap-3 p-5 rounded-2xl border border-white/5 transition-all duration-300 group hover:bg-white/10 active:scale-95 ${bgGlow} ${borderHover}`}
                    >
                      <div className="relative">
                        <div
                          className={`absolute -inset-2 bg-current opacity-20 blur-xl rounded-full transition-opacity group-hover:opacity-40 ${iconColor}`}
                        />
                        <item.icon
                          size={32}
                          className={`relative z-10 transition-transform group-hover:scale-110 ${iconColor}`}
                          strokeWidth={1.5}
                        />
                      </div>

                      <span className="text-[15px] font-semibold text-white mt-1">
                        {item.label}
                      </span>

                      {item.badge && (
                        <span className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.5)]">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
