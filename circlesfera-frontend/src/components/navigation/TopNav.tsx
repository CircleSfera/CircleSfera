import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { useNotificationsStore } from '../../stores/notificationsStore';

export default function TopNav() {
  const unreadMessagesCount = useNotificationsStore(
    (state) => state.unreadMessagesCount,
  );

  return (
    <div className="flex md:hidden sticky top-0 left-0 right-0 pt-[env(safe-area-inset-top)] border-b border-white/5 bg-black/60 backdrop-blur-2xl z-50 items-center justify-between px-4 h-[calc(4rem+env(safe-area-inset-top))]">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2">
        <img
          src={logoSrc}
          alt="CircleSfera"
          className="h-8 w-auto object-contain"
        />
        <span className="text-xl font-black tracking-tighter text-white">
          CircleSfera
        </span>
      </Link>

      {/* Direct Messages Icon */}
      <div className="flex items-center gap-2">
        <Link
          to="/direct/inbox"
          className="p-2 relative active:scale-90 transition-transform"
        >
          <motion.div
            whileTap={{ scale: 0.9 }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <MessageCircle size={26} />
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1 shadow-lg shadow-red-500/50">
                {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
              </span>
            )}
          </motion.div>
        </Link>
      </div>
    </div>
  );
}
