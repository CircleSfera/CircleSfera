import { motion } from 'framer-motion';
import {
  BarChart3,
  Clapperboard,
  Heart,
  Home,
  PlusSquare,
  Search,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationsStore } from '../../stores/notificationsStore';
import { useUIStore } from '../../stores/uiStore';

export default function BottomNav() {
  const location = useLocation();
  const path = location.pathname;
  const { profile } = useAuthStore();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);
  const { t } = useTranslation();

  const profileUrl = profile?.username ? `/${profile.username}` : '/';

  // Check if current path is the user's profile
  const isProfileActive = profile?.username && path === `/${profile.username}`;

  // Mobile nav items - expanded to include Notifications & Creator Studio
  const navItems = [
    { icon: Home, label: t('nav.home'), to: '/', badge: 0 },
    { icon: Search, label: t('nav.search'), to: '/explore', badge: 0 },
    { icon: PlusSquare, label: t('nav.create'), onClick: openCreateMenu, badge: 0 },
    { icon: Clapperboard, label: t('nav.frames'), to: '/frames', badge: 0 },
    {
      icon: BarChart3,
      label: t('nav.creator_studio'),
      to: '/creator',
      badge: 0,
      roles: ['CREATOR', 'BUSINESS'],
    },
    {
      icon: Heart,
      label: t('nav.notifications'),
      to: '/activity',
      badge: unreadCount,
    },
    { icon: User, label: t('nav.profile'), to: profileUrl, badge: 0 },
  ].filter(
    (item) =>
      !item.roles || item.roles.includes(profile?.accountType || 'PERSONAL'),
  );

  return (
    <nav
      aria-label="Mobile navigation"
      className="flex md:hidden fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/80 backdrop-blur-3xl z-50"
    >
      {/* Subtle Top Inner Glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex items-center justify-between w-full px-4 py-4 pb-safe relative z-10">
        {navItems.map((item) => {
          const isActive =
            item.label === t('nav.profile')
              ? isProfileActive
              : item.to ? (path === item.to || (item.to !== '/' && path.startsWith(item.to))) : false;

          const content = (
            <motion.div
              className={`${
                isActive
                  ? 'text-brand-primary drop-shadow-[0_0_12px_rgba(131,58,180,0.6)]'
                  : 'text-gray-500'
              }`}
              whileTap={{ scale: 0.9 }}
            >
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />

              {/* Notification Badge */}
              {item.badge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full px-1 shadow-lg shadow-red-500/50 animate-pulse">
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
                className="p-1.5 relative focus:outline-none"
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
              className="p-1.5 relative focus:outline-none"
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
