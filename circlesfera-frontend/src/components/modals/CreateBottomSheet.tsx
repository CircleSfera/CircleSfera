import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import {
  Clapperboard,
  Grid,
  Heart,
  PlusCircle,
  Radio,
  Star,
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
      id: 'edits',
      icon: Wand2,
      label: t('create_menu.edits', 'Edits'),
      badge: t('create_menu.new', 'Nuevo'),
      action: () => handleNavigation('/create?tab=edit'),
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
      action: () => handleNavigation('/create'),
    },
    {
      id: 'fundraiser',
      icon: Heart,
      label: t('create_menu.fundraiser', 'Recaudación de fondos'),
      action: () => handleNavigation('/create'),
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
            className="fixed bottom-0 left-0 right-0 z-101 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-t-[32px] md:max-w-md md:mx-auto md:bottom-4 md:rounded-[32px] shadow-[0_0_40px_rgba(131,58,180,0.2)] overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Drag Handle Area */}
            <div
              className="w-full flex justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-10 h-1.5 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="text-center pb-4 border-b border-white/10">
              <h2 className="text-white font-bold text-lg">
                {t('create_menu.title', 'Crear')}
              </h2>
            </div>

            {/* Menu Items */}
            <div className="overflow-y-auto overscroll-contain px-4 py-2 pb-safe">
              <div className="flex flex-col">
                {menuItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={item.action}
                    className="flex items-center gap-4 py-4 px-2 hover:bg-white/5 rounded-2xl transition-colors text-left group"
                  >
                    <item.icon
                      size={28}
                      className="text-white/90"
                      strokeWidth={1.5}
                    />
                    <span className="flex-1 text-[17px] font-medium text-white">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
