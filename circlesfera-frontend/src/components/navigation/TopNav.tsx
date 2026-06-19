import { motion } from 'framer-motion';
import { Menu, MessageCircle, PlusSquare } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationsStore } from '../../stores/notificationsStore';
import { useUIStore } from '../../stores/uiStore';

export default function TopNav() {
  const location = useLocation();
  const { profile } = useAuthStore();
  const openCreateMenu = useUIStore((state) => state.openCreateMenu);
  const unreadMessagesCount = useNotificationsStore(
    (state) => state.unreadMessagesCount,
  );

  const isMyProfile =
    profile?.username && location.pathname === `/${profile.username}`;

  return (
    <div className="flex md:hidden sticky top-0 left-0 right-0 pt-[env(safe-area-inset-top)] border-b border-white/5 bg-transparent backdrop-blur-2xl z-50 items-center justify-between px-3 h-[calc(3.5rem+env(safe-area-inset-top))]">
      {/* Left: Create Button */}
      <div className="flex-1 flex justify-start">
        <button
          type="button"
          onClick={openCreateMenu}
          className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors focus:outline-none"
          aria-label="Crear publicación"
        >
          <PlusSquare size={22} strokeWidth={2} />
        </button>
      </div>

      {/* Center: Logo */}
      <Link to="/" className="flex items-center justify-center gap-2 flex-none">
        <img
          src={logoSrc}
          alt="CircleSfera"
          className="h-6 w-auto object-contain"
        />
        <span className="text-lg font-black tracking-tighter text-white">
          CircleSfera
        </span>
      </Link>

      {/* Right: Actions */}
      <div className="flex-1 flex justify-end">
        {isMyProfile ? (
          <Link
            to="/settings"
            className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors focus:outline-none"
            aria-label="Ajustes"
          >
            <Menu size={24} strokeWidth={2} />
          </Link>
        ) : (
          <Link
            to="/direct/inbox"
            className="p-2 relative active:scale-90 transition-transform"
            aria-label="Mensajes directos"
          >
            <motion.div
              whileTap={{ scale: 0.9 }}
              className="text-white hover:text-gray-300 transition-colors"
            >
              <MessageCircle size={22} />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full px-1 shadow-lg shadow-red-500/50">
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </span>
              )}
            </motion.div>
          </Link>
        )}
      </div>
    </div>
  );
}
