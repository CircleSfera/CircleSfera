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
  Sparkles,
  User,
  Wand2,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { chatApi, notificationsApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationsStore } from '../../stores/notificationsStore';
import { useUIStore } from '../../stores/uiStore';

/**
 * Sidebar — Design System §9.4 & §18.1
 * Collapsed (md):  68px  (--nav-sidebar-collapsed)
 * Expanded (xl):   260px (--nav-sidebar-width)
 * Icon size nav:   24px  (--icon-nav)
 * Label:           text-sm (14px, --text-body-sm)
 * Glassmorphism per §16.2
 */
export default function Sidebar() {
  const location = useLocation();
  const path = location.pathname;
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
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
      icon: Wand2,
      label: t('nav.studio', 'Studio'),
      to: '/edits',
      badge: 0,
    },
    {
      icon: BarChart3,
      label: t('nav.creator_studio'),
      to: '/creator',
      badge: 0,
      roles: ['CREATOR', 'BUSINESS'],
    },
    { icon: User, label: t('nav.profile'), to: profileUrl, badge: 0 },
  ].filter(
    (item) =>
      !item.roles || item.roles.includes(profile?.accountType || 'PERSONAL'),
  );

  return (
    <div
      className="sidebar-root hidden md:flex md:flex-col fixed left-0 top-0 bottom-0 z-50 transition-all duration-300 w-17 xl:w-65"
      style={{
        background: 'rgba(8, 6, 15, 0.92)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        boxShadow:
          '4px 0 24px rgba(0,0,0,0.4), inset -1px 0 0 rgba(255,255,255,0.04)',
      }}
    >
      <style>{`
        @media (min-width: 1280px) {
          .sidebar-root { width: var(--nav-sidebar-width, 260px) !important; }
        }
      `}</style>

      {/* Logo Area */}
      <div className="px-3 py-4 flex justify-center xl:justify-start shrink-0">
        <Link
          to="/"
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 rounded-lg"
        >
          <img
            src={logoSrc}
            alt="CircleSfera"
            className="h-7 w-auto object-contain"
          />
        </Link>
      </div>

      {/* Separator */}
      <div className="mx-3 mb-2 h-px bg-linear-to-r from-transparent via-white/8 to-transparent shrink-0" />

      {/* Navigation Items */}
      <nav
        className="flex-1 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden no-scrollbar"
        aria-label="Main navigation"
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
            <>
              <div
                className="relative shrink-0 flex items-center justify-center"
                style={{ width: 24, height: 24 }}
              >
                <item.icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className={
                    isActive ? 'drop-shadow-[0_0_6px_rgba(140,82,255,0.7)]' : ''
                  }
                />

                {/* Badge — collapsed mode */}
                {item.badge > 0 && (
                  <span
                    className="xl:hidden absolute -top-1.5 -right-1.5 min-w-4 h-4 flex items-center justify-center font-bold text-white rounded-full px-1"
                    style={{
                      fontSize: '9px',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
                    }}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>

              {/* Label — Design System §6.3: 500 weight for labels */}
              <span
                className="hidden xl:block text-sm font-medium transition-all duration-200 truncate"
                style={{ fontWeight: isActive ? 700 : 500 }}
              >
                {item.label}
              </span>

              {/* Badge — expanded mode */}
              {item.badge > 0 && (
                <span
                  className="hidden xl:flex ml-auto min-w-4 h-4 items-center justify-center font-bold text-white rounded-full px-1"
                  style={{
                    fontSize: '9px',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
                  }}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </>
          );

          const activeClass = 'nav-active text-white';
          const inactiveClass =
            'text-gray-400/80 hover:bg-white/5 hover:text-white/90';

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
                style={{ minHeight: 44 }}
              >
                {isActive && <span className="nav-active-indicator" />}
                <motion.div
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  className="flex items-center gap-3 w-full"
                >
                  {content}
                </motion.div>
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
              style={{ minHeight: 44 }}
            >
              {isActive && <span className="nav-active-indicator" />}
              <motion.div
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.94 }}
                className="flex items-center gap-3 w-full"
              >
                {content}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Separator */}
      <div className="mx-3 mt-2 mb-2 h-px bg-linear-to-r from-transparent via-white/8 to-transparent shrink-0" />

      {/* Bottom: Premium + Settings + Logout */}
      <div className="px-2 pb-4 space-y-0.5 shrink-0">
        <Link
          to="/pricing"
          aria-label="Premium"
          className="flex items-center gap-3 py-2.5 px-3 rounded-xl text-amber-400/90 hover:text-amber-300 transition-all duration-200 group relative overflow-hidden active:scale-95"
          style={{
            background:
              'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(252,176,69,0.04) 100%)',
            border: '1px solid rgba(251,191,36,0.12)',
            minHeight: 44,
          }}
        >
          <div className="absolute inset-0 bg-linear-to-r from-amber-400/0 via-amber-400/8 to-amber-400/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <Sparkles
            size={20}
            className="drop-shadow-[0_0_8px_rgba(251,191,36,0.6)] shrink-0"
          />
          <span className="hidden xl:block text-sm font-bold tracking-wide">
            {t('nav.premium')}
          </span>
        </Link>

        <Link
          to="/accounts"
          aria-label="Settings"
          className="flex items-center gap-3 py-2.5 px-3 rounded-xl text-gray-400/80 hover:bg-white/5 hover:text-white/90 transition-all duration-200 active:scale-95"
          style={{ minHeight: 44 }}
        >
          <Settings size={20} className="shrink-0" />
          <span className="hidden xl:block text-sm font-medium">
            {t('nav.settings')}
          </span>
        </Link>

        <button
          type="button"
          onClick={logout}
          aria-label="Log out"
          className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-red-400/80 hover:bg-red-500/8 hover:text-red-300 transition-all duration-200 active:scale-95"
          style={{ minHeight: 44 }}
        >
          <LogOut size={20} className="shrink-0" />
          <span className="hidden xl:block text-sm font-medium">
            {t('nav.log_out')}
          </span>
        </button>
      </div>
    </div>
  );
}
