import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Clapperboard,
  Home,
  PlusSquare,
  Search,
  User,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';

/**
 * BottomNav — Layout Guidelines density + tokens
 * Height: var(--nav-bottom-height) (60px) + safe-area-inset-bottom
 * Strictly 5 core items max for clean spacing and touch target density
 */
export default function BottomNav() {
  const location = useLocation();
  const path = location.pathname;
  const profile = useAuthStore((state) => state.profile);
  const isCreatorModeActive = useAuthStore(
    (state) => state.isCreatorModeActive,
  );
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);
  const { t } = useTranslation();

  const triggerHaptic = () => {
    try {
      Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Ignored
    }
  };

  const profileUrl = profile?.username ? `/${profile.username}` : '/';
  const isProfileActive = profile?.username && path === `/${profile.username}`;

  const consumerNavItems = [
    { icon: Home, label: t('nav.home'), to: '/', badge: 0 },
    { icon: Search, label: t('nav.search'), to: '/explore', badge: 0 },
    {
      icon: PlusSquare,
      label: t('nav.create'),
      onClick: openCreateMenu,
      badge: 0,
    },
    { icon: Clapperboard, label: t('nav.frames'), to: '/frames', badge: 0 },
    { icon: User, label: t('nav.profile'), to: profileUrl, badge: 0 },
  ];

  const creatorNavItems = [
    { icon: Home, label: t('nav.home'), to: '/', badge: 0 },
    { icon: Wand2, label: t('nav.studio'), to: '/edits', badge: 0 },
    {
      icon: PlusSquare,
      label: t('nav.create'),
      onClick: openCreateMenu,
      badge: 0,
    },
    {
      icon: BarChart3,
      label: t('nav.creator_studio'),
      to: '/creator',
      badge: 0,
    },
    { icon: User, label: t('nav.profile'), to: profileUrl, badge: 0 },
  ];

  const navItems = isCreatorModeActive ? creatorNavItems : consumerNavItems;

  return (
    <nav
      aria-label="Mobile navigation"
      className="flex flex-col justify-start md:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(18, 18, 18, 0.85)',
        backdropFilter: 'blur(28px) saturate(200%)',
        WebkitBackdropFilter: 'blur(28px) saturate(200%)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        boxShadow:
          '0 -4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        /* Explicit height to fix WebKit padding clip bugs */
        height:
          'calc(var(--nav-bottom-height, 60px) + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div
        className="flex items-center justify-around w-full px-1"
        style={{ height: 'var(--nav-bottom-height, 60px)' }}
      >
        {navItems.map((item) => {
          const isActive =
            item.label === t('nav.profile')
              ? isProfileActive
              : item.to
                ? path === item.to ||
                  (item.to !== '/' && path.startsWith(item.to))
                : false;

          const content = (
            <motion.div
              className={`flex flex-col items-center justify-center gap-0.5 relative ${
                isActive ? 'text-white' : 'text-gray-400/70'
              }`}
              style={{ minWidth: 44, minHeight: 44 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.88 }}
            >
              {/* Active indicator line top */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    key="active-top-line"
                    layoutId="activeBottomNavLine"
                    className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                    style={{
                      background: 'linear-gradient(90deg, #ff5757, #8c52ff)',
                      boxShadow: '0 0 8px rgba(140,82,255,0.6)',
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Icon — 22px navigation size */}
              <item.icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.8}
                className={`relative z-10 transition-all duration-150 ${
                  isActive ? 'drop-shadow-[0_0_6px_rgba(140,82,255,0.7)]' : ''
                }`}
              />

              {/* Label — always visible for native feel */}
              <span
                className={`text-[10px] font-medium leading-none transition-all duration-150 ${
                  isActive ? 'font-bold text-white' : 'text-gray-500'
                }`}
              >
                {item.label}
              </span>

              {/* Notification badge */}
              {item.badge > 0 && (
                <span
                  className="absolute -top-0.5 right-0 min-w-4 h-4 flex items-center justify-center font-bold text-white rounded-full px-1"
                  style={{
                    fontSize: '9px',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
                  }}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </motion.div>
          );

          if (item.onClick) {
            return (
              <button
                type="button"
                key={item.label}
                onClick={() => {
                  triggerHaptic();
                  item.onClick?.();
                }}
                className="relative focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded-lg"
                aria-label={item.label}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              to={item.to!}
              onClick={triggerHaptic}
              className="relative focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded-lg"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
