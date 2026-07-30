import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Clapperboard,
  Heart,
  Home,
  PlusSquare,
  Search,
  Shield,
  User,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationsStore } from '../../stores/notificationsStore';
import { useUIStore } from '../../stores/uiStore';

export default function BottomNav() {
  const location = useLocation();
  const path = location.pathname;
  const { profile, isCreatorModeActive } = useAuthStore();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);
  const { t } = useTranslation();

  const profileUrl = profile?.username ? `/${profile.username}` : '/';

  // Check if current path is the user's profile
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
    {
      icon: Heart,
      label: t('nav.notifications'),
      to: '/activity',
      badge: unreadCount,
    },
    { icon: Shield, label: 'Admin', to: '/admin', badge: 0, adminOnly: true },
    { icon: User, label: t('nav.profile'), to: profileUrl, badge: 0 },
  ];

  const creatorNavItems = [
    { icon: Home, label: t('nav.home'), to: '/', badge: 0 },
    { icon: Wand2, label: 'Studio', to: '/edits', badge: 0 },
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
    { icon: Shield, label: 'Admin', to: '/admin', badge: 0, adminOnly: true },
    { icon: User, label: t('nav.profile'), to: profileUrl, badge: 0 },
  ];

  const currentNavItems = isCreatorModeActive
    ? creatorNavItems
    : consumerNavItems;

  const navItems = currentNavItems.filter((item) => {
    if ('adminOnly' in item && item.adminOnly) {
      return profile?.user?.role === 'ADMIN';
    }
    return true;
  });

  return (
    <nav
      aria-label="Mobile navigation"
      className="flex md:hidden fixed bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 h-14 z-50"
      style={{
        background:
          'linear-gradient(135deg, rgba(10,7,18,0.88) 0%, rgba(6,5,14,0.92) 100%)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '9999px',
        boxShadow:
          '0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px rgba(131,58,180,0.06)',
      }}
    >
      <div className="flex items-center justify-between w-full px-2 relative z-10">
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
              className={`flex flex-col items-center justify-center gap-0.5 w-10 h-10 rounded-full transition-all duration-300 relative ${
                isActive ? 'text-white' : 'text-gray-400/80'
              }`}
              whileHover={{ scale: 1.12, y: -2 }}
              whileTap={{ scale: 0.85, y: 2 }}
            >
              {/* Active glow background */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    key="active-bg"
                    layoutId="activeNavBg"
                    className="absolute inset-0 rounded-full"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(131,58,180,0.3) 0%, rgba(253,29,29,0.18) 100%)',
                      boxShadow:
                        '0 0 18px rgba(131,58,180,0.45), inset 0 1px 1px rgba(255,255,255,0.2)',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  />
                )}
              </AnimatePresence>

              <item.icon
                size={20}
                strokeWidth={isActive ? 2.5 : 2}
                className={`relative z-10 ${isActive ? 'drop-shadow-[0_0_6px_rgba(131,58,180,0.8)]' : ''}`}
              />

              {/* Notification Badge */}
              {item.badge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-linear-to-br from-red-500 to-red-600 rounded-full px-1 shadow-lg shadow-red-500/40">
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
                onClick={item.onClick}
                className="p-1 relative focus:outline-none"
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
              className="p-1 relative focus:outline-none"
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
