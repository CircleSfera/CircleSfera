import { motion } from 'framer-motion';
import {
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
import UserAvatar from '../UserAvatar';

export default function BottomNav() {
  const location = useLocation();
  const path = location.pathname;
  const { profile } = useAuthStore();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const { openCreateMenu } = useUIStore();
  const { t } = useTranslation();

  const profileUrl = profile?.username ? `/${profile.username}` : '/';

  // Check if current path is the user's profile
  const isProfileActive = profile?.username && path === `/${profile.username}`;

  // Mobile nav items - expanded to include Notifications & Creator Studio
  const navItems = [
    { id: 'home', icon: Home, label: t('nav.home'), to: '/', badge: 0 },
    {
      id: 'search',
      icon: Search,
      label: t('nav.search'),
      to: '/explore',
      badge: 0,
    },
    {
      id: 'create',
      icon: PlusSquare,
      label: t('nav.create'),
      isAction: true,
      badge: 0,
    },
    {
      id: 'reels',
      icon: Clapperboard,
      label: t('nav.frames'),
      to: '/frames',
      badge: 0,
    },
    {
      id: 'activity',
      icon: Heart,
      label: t('nav.activity', 'Activity'),
      to: '/activity',
      badge: unreadCount,
    },
    {
      id: 'profile',
      icon: User,
      label: t('nav.profile'),
      to: profileUrl,
      badge: 0,
    },
  ];

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
              : (item.to && path === item.to) ||
                (item.to && item.to !== '/' && path.startsWith(item.to));

          const content = (
            <motion.div
              className={`${
                isActive
                  ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]'
                  : 'text-gray-500'
              } flex flex-col items-center justify-center`}
              whileTap={{ scale: 0.9 }}
            >
              {item.id === 'profile' ? (
                <div
                  className={`w-7 h-7 rounded-full overflow-hidden ${
                    isActive ? 'ring-2 ring-white p-[2px]' : ''
                  } transition-all duration-300`}
                >
                  <UserAvatar
                    src={profile?.avatar}
                    thumbnailUrl={profile?.thumbnailUrl}
                    standardUrl={profile?.standardUrl}
                    alt={profile?.username || 'Profile'}
                    size="full"
                  />
                </div>
              ) : (
                <item.icon size={26} strokeWidth={isActive ? 2.5 : 2} />
              )}

              {/* Notification Badge */}
              {item.badge > 0 && (
                <span className="absolute top-0 right-0 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full px-1 shadow-lg shadow-red-500/50 animate-pulse">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </motion.div>
          );

          if (item.isAction) {
            return (
              <button
                type="button"
                key={item.label}
                onClick={openCreateMenu}
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
              to={item.to || '/'}
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
