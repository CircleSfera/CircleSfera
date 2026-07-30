import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Bookmark,
  Clapperboard,
  Heart,
  Home,
  LogOut,
  MessageCircle,
  PlusSquare,
  Search,
  Settings,
  Shield,
  Sparkles,
  User,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { chatApi, notificationsApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationsStore } from '../../stores/notificationsStore';
import { useUIStore } from '../../stores/uiStore';

export default function Sidebar() {
  const location = useLocation();
  const path = location.pathname;
  const { profile, logout, isAuthenticated } = useAuthStore();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);
  const unreadMessagesCount = useNotificationsStore(
    (state) => state.unreadMessagesCount,
  );
  const setUnreadCount = useNotificationsStore((state) => state.setUnreadCount);
  const setUnreadMessagesCount = useNotificationsStore(
    (state) => state.setUnreadMessagesCount,
  );
  const { t } = useTranslation();

  // Fetch unread notification count
  const { data: unreadData } = useQuery({
    queryKey: ['unreadNotifications'],
    queryFn: () => notificationsApi.getUnreadCount(),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (unreadData?.data) {
      setUnreadCount(unreadData.data.count);
    }
  }, [unreadData, setUnreadCount]);

  // Fetch unread messages count
  const { data: unreadMessagesData } = useQuery({
    queryKey: ['unreadMessages'],
    queryFn: () => chatApi.getUnreadCount(),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (unreadMessagesData?.data) {
      setUnreadMessagesCount(unreadMessagesData.data.count);
    }
  }, [unreadMessagesData, setUnreadMessagesCount]);

  const profileUrl = profile?.username ? `/${profile.username}` : '/';

  // Check if current path is the user's profile
  const isProfileActive = profile?.username && path === `/${profile.username}`;

  const navItems = [
    { icon: Home, label: t('nav.home'), to: '/', badge: 0 },
    { icon: Search, label: t('nav.search'), to: '/explore', badge: 0 },
    { icon: Clapperboard, label: t('nav.frames'), to: '/frames', badge: 0 },
    {
      icon: PlusSquare,
      label: t('nav.create'),
      onClick: openCreateMenu,
      badge: 0,
    },
    {
      icon: MessageCircle,
      label: t('nav.messages'),
      to: '/direct/inbox',
      badge: unreadMessagesCount,
    },
    {
      icon: Heart,
      label: t('nav.notifications'),
      to: '/activity',
      badge: unreadCount,
    },
    { icon: Bookmark, label: t('nav.saved'), to: '/saved', badge: 0 },
    {
      icon: BarChart3,
      label: t('nav.creator_studio'),
      to: '/creator',
      badge: 0,
      roles: ['CREATOR', 'BUSINESS'],
    },
    {
      icon: Shield,
      label: 'Admin Panel',
      to: '/admin',
      badge: 0,
      adminOnly: true,
    },
    { icon: User, label: t('nav.profile'), to: profileUrl, badge: 0 },
  ].filter((item) => {
    if ('adminOnly' in item && item.adminOnly) {
      return profile?.user?.role === 'ADMIN';
    }
    return (
      !item.roles || item.roles.includes(profile?.accountType || 'PERSONAL')
    );
  });

  return (
    <div
      className="hidden md:flex md:flex-col fixed left-3 top-3 bottom-3 w-14 xl:w-52 z-50 transition-all duration-300"
      style={{
        background:
          'linear-gradient(180deg, rgba(12,8,20,0.92) 0%, rgba(8,6,16,0.95) 100%)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '20px',
        boxShadow:
          '0 10px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Logo Area */}
      <div className="p-3 mb-1 flex justify-center xl:justify-start">
        <Link to="/" className="block">
          {/* Desktop Logo */}
          <img
            src={logoSrc}
            alt="CircleSfera Logo"
            className="hidden xl:block h-7 w-auto object-contain"
          />
          {/* Tablet Logo (Icon) */}
          <img
            src={logoSrc}
            alt="CircleSfera Logo"
            className="xl:hidden h-7 w-7 object-contain"
          />
        </Link>
      </div>

      {/* Separator */}
      <div className="mx-3 mb-1.5 h-px bg-linear-to-r from-transparent via-white/8 to-transparent" />

      {/* Navigation Items */}
      <nav className="flex-1 px-1.5 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.label === t('nav.profile')
              ? isProfileActive
              : item.to
                ? path === item.to ||
                  (item.to !== '/' && path.startsWith(item.to))
                : false;

          const content = (
            <>
              <motion.div
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                className="relative shrink-0"
              >
                <item.icon
                  size={17}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={
                    isActive ? 'drop-shadow-[0_0_6px_rgba(140,82,255,0.7)]' : ''
                  }
                />

                {/* Notification Badge (Hidden on Desktop Expanded View) */}
                {item.badge > 0 && (
                  <span className="xl:hidden absolute -top-1.5 -right-1.5 min-w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-linear-to-br from-red-500 to-red-600 rounded-full px-1 shadow-md">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </motion.div>
              <span
                className={`hidden xl:block text-xs transition-all duration-200 ${isActive ? 'font-bold' : 'font-medium'}`}
              >
                {item.label}
              </span>

              {/* Badge for desktop expanded view */}
              {item.badge > 0 && (
                <span className="hidden xl:flex ml-auto min-w-4.5 h-4.5 items-center justify-center text-[10px] font-bold text-white bg-linear-to-br from-red-500 to-red-600 rounded-full px-1 shadow-md">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </>
          );

          const activeClass = 'nav-active text-white';
          const inactiveClass =
            'text-gray-400/90 hover:bg-white/5 hover:text-white/90';

          if (item.onClick) {
            return (
              <button
                type="button"
                key={item.label}
                onClick={item.onClick}
                aria-label={item.label}
                className={`relative w-full flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-200 group active:scale-95 overflow-hidden ${
                  isActive ? activeClass : inactiveClass
                }`}
              >
                {isActive && <span className="nav-active-indicator" />}
                {content}
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              to={item.to!}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-200 group active:scale-95 overflow-hidden ${
                isActive ? activeClass : inactiveClass
              }`}
            >
              {isActive && <span className="nav-active-indicator" />}
              {content}
            </Link>
          );
        })}
      </nav>

      {/* Separator before bottom area */}
      <div className="mx-3 mt-2 mb-2 h-px bg-linear-to-r from-transparent via-white/8 to-transparent" />

      {/* Bottom Area (More/Settings) */}
      <div className="p-2 mb-1 space-y-0.5">
        <Link
          to="/pricing"
          aria-label="Premium"
          className="flex items-center gap-3 py-2.5 px-3 rounded-xl text-amber-400/90 hover:text-amber-300 transition-all duration-200 group relative overflow-hidden active:scale-95"
          style={{
            background:
              'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(252,176,69,0.04) 100%)',
            border: '1px solid rgba(251,191,36,0.12)',
          }}
        >
          {/* Shimmer sweep */}
          <div className="absolute inset-0 bg-linear-to-r from-amber-400/0 via-amber-400/8 to-amber-400/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <Sparkles
            size={18}
            className="drop-shadow-[0_0_8px_rgba(251,191,36,0.6)] shrink-0"
          />
          <span className="hidden xl:block text-sm font-bold tracking-wide">
            {t('nav.premium')}
          </span>
        </Link>

        <Link
          to="/accounts/edit"
          aria-label="Settings"
          className="flex items-center gap-3 py-2.5 px-3 rounded-xl text-gray-400/80 hover:bg-white/5 hover:text-white/90 transition-all duration-200 active:scale-95"
        >
          <Settings size={18} className="shrink-0" />
          <span className="hidden xl:block text-sm font-medium">
            {t('nav.settings')}
          </span>
        </Link>

        {/* Logout Button */}
        <button
          type="button"
          onClick={logout}
          aria-label="Log out"
          className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-red-400/80 hover:bg-red-500/8 hover:text-red-300 transition-all duration-200 active:scale-95"
        >
          <LogOut size={18} className="shrink-0" />
          <span className="hidden xl:block text-sm font-medium">
            {t('nav.log_out')}
          </span>
        </button>
      </div>
    </div>
  );
}
