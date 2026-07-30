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
    <div
      className="flex md:hidden sticky top-0 left-0 right-0 pt-[env(safe-area-inset-top)] z-50 items-center justify-between px-3 h-[calc(3.5rem+env(safe-area-inset-top))]"
      style={{
        background:
          'linear-gradient(180deg, rgba(8,6,18,0.9) 0%, rgba(6,4,14,0.85) 100%)',
        backdropFilter: 'blur(24px) saturate(200%)',
        WebkitBackdropFilter: 'blur(24px) saturate(200%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(131,58,180,0.08)',
      }}
    >
      {/* Left: Create Button */}
      <div className="flex-1 flex justify-start">
        <motion.button
          type="button"
          onClick={openCreateMenu}
          whileTap={{ scale: 0.88 }}
          className="p-2 text-white/80 hover:text-white hover:bg-white/8 rounded-xl transition-all focus:outline-none"
          aria-label="Crear publicación"
          style={{ borderRadius: '12px' }}
        >
          <PlusSquare size={22} strokeWidth={2} />
        </motion.button>
      </div>

      {/* Center: Logo */}
      <Link to="/" className="flex items-center justify-center gap-2 flex-none">
        <img
          src={logoSrc}
          alt="CircleSfera"
          className="h-6 w-auto object-contain"
        />
        <span
          className="text-lg font-black tracking-tighter"
          style={{
            background:
              'linear-gradient(90deg, #ffffff 0%, rgba(255,255,255,0.6) 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          CircleSfera
        </span>
      </Link>

      {/* Right: Actions */}
      <div className="flex-1 flex justify-end">
        {isMyProfile ? (
          <motion.div whileTap={{ scale: 0.88 }}>
            <Link
              to="/settings"
              className="p-2 text-white/80 hover:text-white hover:bg-white/8 rounded-xl transition-all focus:outline-none block"
              aria-label="Ajustes"
              style={{ borderRadius: '12px' }}
            >
              <Menu size={24} strokeWidth={2} />
            </Link>
          </motion.div>
        ) : (
          <Link
            to="/direct/inbox"
            className="p-2 relative active:scale-90 transition-transform focus:outline-none"
            aria-label="Mensajes directos"
          >
            <motion.div
              whileTap={{ scale: 0.88 }}
              className="text-white/80 hover:text-white transition-colors"
            >
              <MessageCircle size={22} />
              {unreadMessagesCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 flex items-center justify-center text-xs font-bold text-white rounded-full px-1 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    boxShadow: '0 2px 8px rgba(239,68,68,0.5)',
                    fontSize: '10px',
                  }}
                >
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
