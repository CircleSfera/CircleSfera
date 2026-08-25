import { clsx } from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  Bookmark,
  Clapperboard,
  Gift,
  Heart,
  Home,
  MessageCircle,
  MoreHorizontal,
  PlusSquare,
  Search,
  Send,
  User,
} from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import logoSrc from '../../assets/logo.png';

export type GuestSurface =
  | 'home'
  | 'explore'
  | 'feed'
  | 'frames'
  | 'direct'
  | 'live'
  | 'creator';

const SURFACES: GuestSurface[] = [
  'home',
  'explore',
  'feed',
  'frames',
  'direct',
  'live',
  'creator',
];

export function chapterToSurface(chapter: string): GuestSurface {
  if (SURFACES.includes(chapter as GuestSurface)) {
    return chapter as GuestSurface;
  }
  return 'home';
}

export interface GuestSurfaceMediaProps extends HTMLAttributes<HTMLElement> {
  surface: GuestSurface;
  compact?: boolean;
}

function MockAvatar({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim =
    size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  return (
    <div
      className={clsx(
        dim,
        'rounded-full shrink-0 bg-linear-to-br from-brand-primary to-brand-secondary opacity-85',
        className,
      )}
    />
  );
}

function MockPost({ withMedia }: { withMedia: boolean }) {
  return (
    <div className="glass-panel-post rounded-lg mx-2 mb-2 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <MockAvatar />
        <div className="min-w-0 flex-1">
          <div className="h-2.5 w-20 rounded-full bg-white/35" />
          <div className="mt-1 h-2 w-14 rounded-full bg-white/15" />
        </div>
        <MoreHorizontal size={16} className="text-white/40" />
      </div>
      <div className="px-2.5 pb-2 space-y-1.5">
        <div className="h-2.5 w-full rounded-full bg-white/20" />
        <div className="h-2.5 w-4/5 rounded-full bg-white/15" />
      </div>
      {withMedia && (
        <div className="aspect-4/5 w-full bg-linear-to-br from-brand-primary/25 via-surface-raised to-brand-blue/20" />
      )}
      <div className="flex items-center justify-between px-1 py-1">
        <div className="flex items-center">
          <Heart size={20} className="m-2.5 text-white/60" />
          <MessageCircle size={20} className="m-2.5 text-white/60" />
          <Send size={20} className="m-2.5 text-white/60" />
          <Gift size={20} className="m-2.5 text-yellow-500/80" />
        </div>
        <Bookmark size={20} className="m-2.5 text-white/60" />
      </div>
    </div>
  );
}

function MockStories() {
  return (
    <div className="flex justify-between px-4 py-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-1 shrink-0"
          style={{ width: 52 }}
        >
          <div
            className={clsx(
              'rounded-full p-0.5',
              i === 0
                ? 'bg-white/20'
                : 'bg-linear-to-br from-brand-primary to-brand-accent',
            )}
          >
            <MockAvatar className="ring-2 ring-surface-base" />
          </div>
          <div className="h-1.5 w-10 rounded-full bg-white/20" />
        </div>
      ))}
    </div>
  );
}

function MockFeedTabs() {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center py-2.5 px-4">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-black/75 border border-white/12 p-1.5">
        <span className="relative px-5 py-1.5 text-[11px] font-bold text-white">
          <span className="absolute inset-0 rounded-full bg-white/15 border border-white/20" />
          <span className="relative z-10">{t('feed.foryou', 'For You')}</span>
        </span>
        <span className="px-5 py-1.5 text-[11px] font-bold text-white/40">
          {t('feed.following', 'Following')}
        </span>
      </div>
    </div>
  );
}

function MockHome({ compact }: { compact?: boolean }) {
  return (
    <div className="w-full">
      {!compact && <MockFeedTabs />}
      {!compact && <MockStories />}
      <MockPost withMedia />
      <MockPost withMedia={false} />
      {!compact && <MockPost withMedia />}
    </div>
  );
}

function MockExplore() {
  const { t } = useTranslation();
  return (
    <div className="w-full">
      <div className="px-3 pt-3 pb-2">
        <div className="h-11 rounded-full bg-white/8 border border-white/10 flex items-center gap-2 px-4">
          <Search size={16} className="text-white/40" />
          <div className="h-2.5 w-28 rounded-full bg-white/15" />
        </div>
      </div>
      <div className="flex justify-center py-2 px-4">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-black/75 border border-white/12 p-1.5">
          <span className="relative px-5 py-1.5 text-[11px] font-bold text-white">
            <span className="absolute inset-0 rounded-full bg-white/15 border border-white/20" />
            <span className="relative z-10">
              {t('explore.for_you', 'For You')}
            </span>
          </span>
          <span className="px-5 py-1.5 text-[11px] font-bold text-white/40">
            {t('explore.trending', 'Trending')}
          </span>
        </div>
      </div>
      <MockPost withMedia />
      <MockPost withMedia={false} />
    </div>
  );
}

function MockFrames() {
  return (
    <div className="relative w-full h-full min-h-70 bg-linear-to-b from-brand-primary/30 via-surface-raised to-surface-base">
      <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3">
        <MockAvatar />
        <Heart size={22} className="text-white" />
        <MessageCircle size={22} className="text-white" />
        <Send size={22} className="text-white" />
        <Bookmark size={22} className="text-white" />
      </div>
      <div className="absolute left-3 right-14 bottom-8 space-y-2">
        <div className="flex items-center gap-2">
          <MockAvatar size="sm" />
          <div className="h-2.5 w-24 rounded-full bg-white/50" />
        </div>
        <div className="h-2.5 w-4/5 rounded-full bg-white/30" />
        <div className="h-2 w-1/2 rounded-full bg-white/20" />
      </div>
    </div>
  );
}

function MockDirect() {
  return (
    <div className="flex flex-col w-full">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-3 border-b border-white/5"
        >
          <MockAvatar />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex justify-between gap-2">
              <div className="h-2.5 w-24 rounded-full bg-white/30" />
              <div className="h-2 w-8 rounded-full bg-white/10" />
            </div>
            <div className="h-2.5 w-3/4 rounded-full bg-white/15" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MockLive() {
  return (
    <div className="relative w-full h-full min-h-70 bg-linear-to-br from-brand-secondary/40 via-surface-raised to-brand-primary/30">
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="h-6 px-2 rounded-md bg-brand-secondary text-[10px] font-black uppercase tracking-wider text-white flex items-center">
          Live
        </span>
        <span className="h-6 px-2 rounded-md bg-black/50 text-[10px] font-bold text-white/80 flex items-center">
          1.2k
        </span>
      </div>
      <div className="absolute right-3 top-20 flex flex-col gap-2">
        <Heart size={18} className="text-brand-secondary" />
        <Heart size={14} className="text-brand-accent ml-2" />
        <Heart size={16} className="text-white/80" />
      </div>
      <div className="absolute left-3 right-3 bottom-4 space-y-2">
        <div className="h-8 rounded-full bg-black/40 border border-white/10" />
        <div className="h-2.5 w-2/3 rounded-full bg-white/40" />
      </div>
    </div>
  );
}

function MockCreator() {
  return (
    <div className="p-4 space-y-4">
      <div className="h-3 w-28 rounded-full bg-white/30" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/5 p-3"
          >
            <div className="h-2 w-12 rounded-full bg-white/20 mb-2" />
            <div className="h-4 w-14 rounded-full bg-brand-primary/60" />
          </div>
        ))}
      </div>
      <div className="h-36 w-full rounded-xl border border-white/10 bg-white/5 flex items-end p-3 gap-1.5">
        {[40, 61, 30, 80, 50, 92, 70].map((h) => (
          <div
            key={h}
            className="flex-1 bg-brand-primary/40 rounded-t-sm"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function MobileMockTopNav() {
  return (
    <div
      className="flex items-center justify-between px-4 shrink-0 z-20 border-b border-white/7"
      style={{
        height: 'var(--nav-top-height, 52px)',
        background: 'color-mix(in srgb, var(--surface-base) 90%, transparent)',
      }}
    >
      <div className="w-11" />
      <div className="flex items-center gap-1.5">
        <img src={logoSrc} alt="" className="h-6 w-auto object-contain" />
        <span className="brand-wordmark text-sm font-black tracking-tight">
          CircleSfera
        </span>
      </div>
      <div className="flex items-center">
        <Bell size={20} strokeWidth={1.8} className="text-white/80 m-2.5" />
        <MessageCircle
          size={20}
          strokeWidth={1.8}
          className="text-white/80 m-2.5"
        />
      </div>
    </div>
  );
}

function MobileMockNav({ surface }: { surface: GuestSurface }) {
  const items = [
    {
      id: 'home',
      icon: Home,
      active: surface === 'home' || surface === 'feed',
    },
    { id: 'explore', icon: Search, active: surface === 'explore' },
    { id: 'create', icon: PlusSquare, active: false },
    { id: 'frames', icon: Clapperboard, active: surface === 'frames' },
    { id: 'profile', icon: User, active: false },
  ];

  return (
    <div
      className="flex items-center justify-around px-2 shrink-0 z-20 border-t border-white/10"
      style={{
        height: 'var(--nav-bottom-height, 60px)',
        background: 'color-mix(in srgb, var(--surface-base) 88%, transparent)',
      }}
    >
      {items.map((item) => (
        <item.icon
          key={item.id}
          size={24}
          className={item.active ? 'text-white' : 'text-white/40'}
          strokeWidth={item.active ? 2.5 : 2}
        />
      ))}
    </div>
  );
}

function SurfaceBody({
  surface,
  compact,
}: {
  surface: GuestSurface;
  compact?: boolean;
}) {
  if (surface === 'explore') return <MockExplore />;
  if (surface === 'direct') return <MockDirect />;
  if (surface === 'creator') return <MockCreator />;
  if (surface === 'live') return <MockLive />;
  if (surface === 'frames') return <MockFrames />;
  return <MockHome compact={compact} />;
}

export function GuestSurfaceMedia({
  surface,
  compact,
  className = '',
  ...props
}: GuestSurfaceMediaProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const previewKey = surface === 'feed' ? 'home' : surface;
  const label = t(`landing.preview.${previewKey}`);
  const showTopNav = !compact && surface !== 'frames' && surface !== 'creator';
  const showBottomNav = !compact && surface !== 'creator';

  return (
    <figure
      aria-label={label}
      className={clsx(
        'relative overflow-hidden shadow-2xl flex flex-col mx-auto',
        'bg-surface-elevated border border-white/10',
        compact
          ? 'rounded-3xl aspect-square w-full'
          : 'rounded-[40px] aspect-9/16 w-full max-w-90',
        className,
      )}
      {...props}
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-blue/10 blur-[80px] rounded-full pointer-events-none" />

      <div
        className="relative z-10 flex flex-col w-full h-full pointer-events-none select-none"
        aria-hidden
      >
        {showTopNav && <MobileMockTopNav />}

        <div className="flex-1 overflow-hidden relative">
          <motion.div
            initial={reduceMotion ? false : { y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              duration: reduceMotion ? 0 : 0.5,
              delay: reduceMotion ? 0 : 0.15,
            }}
            className="absolute inset-0 mask-[linear-gradient(to_bottom,black_70%,transparent_100%)] overflow-hidden"
          >
            <SurfaceBody surface={surface} compact={compact} />
          </motion.div>
        </div>

        {showBottomNav && <MobileMockNav surface={surface} />}
      </div>
    </figure>
  );
}
