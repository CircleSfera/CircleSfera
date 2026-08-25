import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Bell, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import logoSrc from '../../assets/logo.png';
import { useNotificationsStore } from '../../stores/notificationsStore';

/**
 * TopNav — Design System §9.4 & Layout Guidelines §10
 * Height: 52px (var(--nav-top-height), within 48–56px range)
 * Compact, focused: logo center, notifications + DMs right.
 * Mobile only (hidden on md+)
 */
export default function TopNav() {
  const unreadMessagesCount = useNotificationsStore(
    (state) => state.unreadMessagesCount,
  );
  const unreadCount = useNotificationsStore((state) => state.unreadCount);

  const triggerHaptic = () => {
    try {
      Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Ignored
    }
  };

  return (
    <div
      className="flex md:hidden fixed top-0 left-0 right-0 z-50 items-center justify-between px-4"
      style={{
        height:
          'calc(var(--nav-top-height, 52px) + env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'rgba(8, 6, 15, 0.9)',
        backdropFilter: 'blur(24px) saturate(200%)',
        WebkitBackdropFilter: 'blur(24px) saturate(200%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* Left spacer for perfect centering */}
      <div className="w-11 h-11 pointer-events-none" />

      {/* Center: Logo */}
      <Link
        to="/"
        onClick={triggerHaptic}
        className="flex items-center justify-center gap-1.5 flex-none focus:outline-none"
        aria-label="CircleSfera inicio"
      >
        <img
          src={logoSrc}
          alt="CircleSfera"
          className="h-6 w-auto object-contain"
        />
        <span className="brand-wordmark text-base font-black tracking-tight">
          CircleSfera
        </span>
      </Link>

      {/* Right: Notifications + Messages */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <Link
          to="/activity"
          onClick={triggerHaptic}
          className="relative flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/8 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
          aria-label="Notificaciones"
          style={{ width: 44, height: 44 }}
        >
          <Bell size={20} strokeWidth={1.8} />
          {unreadCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 min-w-4 h-4 flex items-center justify-center font-bold text-white rounded-full"
              style={{
                fontSize: '9px',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
                padding: '0 3px',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Messages */}
        <Link
          to="/direct/inbox"
          onClick={triggerHaptic}
          className="relative flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/8 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
          aria-label="Mensajes directos"
          style={{ width: 44, height: 44 }}
        >
          <MessageCircle size={20} strokeWidth={1.8} />
          {unreadMessagesCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 min-w-4 h-4 flex items-center justify-center font-bold text-white rounded-full"
              style={{
                fontSize: '9px',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
                padding: '0 3px',
              }}
            >
              {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
