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
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { chatApi, notificationsApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationsStore } from '../../stores/notificationsStore';

export default function Sidebar() {
  const location = useLocation();
  const path = location.pathname;
  const { profile, logout, isAuthenticated } = useAuthStore();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
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
    { icon: PlusSquare, label: t('nav.create'), to: '/create', badge: 0 },
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
    { icon: User, label: t('nav.profile'), to: profileUrl, badge: 0 },
  ].filter(
    (item) =>
      !item.roles || item.roles.includes(profile?.accountType || 'PERSONAL'),
  );

  return (
    <div className="hidden md:flex md:flex-col fixed left-0 top-0 h-screen w-20 xl:w-64 border-r border-white/5 bg-black/40 backdrop-blur-2xl z-50 transition-all duration-300">
      {/* Premium Glass Effect Overlay (Subtle Top Light) */}
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
      {/* Logo Area */}
      <div className="p-6 mb-4 flex justify-center xl:justify-start">
        <Link to="/" className="block">
          {/* Desktop Logo */}
          <img
            src={logoSrc}
            alt="CircleSfera Logo"
            className="hidden xl:block h-10 w-auto object-contain"
          />
          {/* Tablet Logo (Icon) */}
          <img
            src={logoSrc}
            alt="CircleSfera Logo"
            className="xl:hidden h-10 w-10 object-contain"
          />
        </Link>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 space-y-2">
        {navItems.map((item) => {
          const isActive =
            item.label === t('nav.profile')
              ? isProfileActive
              : path === item.to ||
                (item.to !== '/' && path.startsWith(item.to));

          return (
            <Link
              key={item.label}
              to={item.to}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'bg-linear-to-r from-brand-primary/30 to-brand-secondary/20 text-white font-bold shadow-[0_0_25px_rgba(131,58,180,0.2)] border border-white/15'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="relative"
              >
                <item.icon size={26} strokeWidth={isActive ? 2.8 : 2} />

                {/* Notification Badge (Hidden on Desktop Expanded View) */}
                {item.badge > 0 && (
                  <span className="xl:hidden absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1 shadow-lg shadow-red-500/50 animate-pulse">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </motion.div>
              <span className="hidden xl:block text-md">{item.label}</span>

              {/* Badge for desktop expanded view */}
              {item.badge > 0 && (
                <span className="hidden xl:flex ml-auto min-w-[22px] h-[22px] items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full px-1.5">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Area (More/Settings) */}
      <div className="p-3 mt-auto mb-4 space-y-2">
        <Link
          to="/pricing"
          aria-label="Premium"
          className="flex items-center gap-4 p-3 rounded-xl text-amber-400 hover:bg-amber-400/10 hover:text-amber-300 transition-all duration-200 group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-linear-to-r from-amber-400/0 via-amber-400/5 to-amber-400/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          <Sparkles
            size={26}
            className="drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
          />
          <span className="hidden xl:block text-md font-bold tracking-wide">
            {t('nav.premium')}
          </span>
        </Link>

        <Link
          to="/accounts/edit"
          aria-label="Settings"
          className="flex items-center gap-4 p-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all duration-200"
        >
          <Settings size={26} />
          <span className="hidden xl:block text-md">{t('nav.settings')}</span>
        </Link>

        {/* Logout Button */}
        <button
          type="button"
          onClick={logout}
          aria-label="Log out"
          className="w-full flex items-center gap-4 p-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
        >
          <LogOut size={26} />
          <span className="hidden xl:block text-md">{t('nav.log_out')}</span>
        </button>
      </div>
    </div>
  );
}
