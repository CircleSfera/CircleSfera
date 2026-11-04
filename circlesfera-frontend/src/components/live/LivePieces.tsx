import { Eye, X } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { initialsAvatarUrl } from '../../utils/initialsAvatar';

// The pieces every Live screen is made of: the frame the video fills, the
// one shape of control, the mark that says the broadcast is live, and the
// one sheet that opens from the bottom.

// The frame. A live is upright 9:16 and the whole picture is shown, as the
// camera takes it: on a phone the frame is as wide as the screen, in the
// middle of the part really in sight, with black around it where the screen
// is longer, and the controls are drawn over both. On a desktop it is an
// upright frame in the middle.
export function LiveFrame({
  video,
  children,
  onDoubleClick,
}: {
  // What fills the frame, behind everything.
  video: ReactNode;
  // The controls, laid over the video.
  children: ReactNode;
  onDoubleClick?: (event: React.MouseEvent) => void;
}) {
  return (
    <div className="live-frame fixed inset-0 z-40 bg-black md:static md:z-auto md:flex md:h-dvh md:items-center md:justify-center md:bg-transparent">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: double tap on the video area, with the reaction buttons as the keyboard path */}
      <div
        className="absolute inset-0 select-none overflow-hidden bg-black md:relative md:inset-auto md:aspect-9/16 md:h-[88vh] md:rounded-3xl md:border md:border-white/10 md:shadow-[0_0_60px_rgba(0,0,0,0.9)]"
        onDoubleClick={onDoubleClick}
      >
        <div className="absolute inset-x-0 top-0 flex h-dvh items-center justify-center md:inset-0 md:h-full">
          <div
            className="relative aspect-9/16 w-[min(100%,calc(100dvh*9/16))] overflow-hidden md:h-full md:w-full"
            data-testid="live-video"
          >
            {video}
            {/* A dark fade at the top and at the bottom keeps what is
                written over the video readable, whatever the video shows. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-linear-to-b from-black/55 to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-linear-to-t from-black/75 via-black/30 to-transparent"
            />
          </div>
        </div>
        {/* What is in sight: a phone's browser hides part of the screen
            under its own bars, and no control may end up there. The layer
            itself lets a tap through to the video and to the controls drawn
            inside it; each band says where it takes taps. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-dvh md:h-full">
          {children}
        </div>
      </div>
    </div>
  );
}

// The one control of a Live screen: a white icon over the video, with 44 px
// to tap and a soft shadow, and no button drawn around it, as Instagram's
// live has them.
export function LiveControl({
  label,
  tone = 'plain',
  className = '',
  children,
  ...button
}: {
  label: string;
  // plain: the usual one. on: something switched off that is now the state
  // to notice (a muted microphone). brand: the one action of a form.
  tone?: 'plain' | 'on' | 'brand';
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  const tones = {
    plain: 'live-icon text-white',
    on: 'live-icon text-white',
    brand: 'bg-brand-primary text-white',
  };
  return (
    <button
      type="button"
      {...button}
      aria-label={label}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${tones[tone]} ${className}`}
    >
      {tone === 'on' ? (
        // Switched off: the icon sits on a small white disc to be noticed.
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

// How long a broadcast has run, as a clock.
export function liveClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(s / 3600);
  const rest = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

// Says the broadcast is live, for how long, and how many people watch.
export function LiveStatus({
  startedAt,
  viewers,
}: {
  // When the broadcast began; without it only the mark is shown.
  startedAt?: number | null;
  viewers: number;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="flex h-6 items-center gap-1 rounded-md bg-red-600 px-1.5 text-xs font-bold text-white">
        <span className="uppercase tracking-wide">{t('live.now')}</span>
        {startedAt ? (
          <span className="tabular-nums font-semibold" data-testid="live-clock">
            {liveClock((now - startedAt) / 1000)}
          </span>
        ) : null}
      </div>
      <div className="flex h-6 items-center gap-1 rounded-md bg-black/45 px-1.5 text-xs font-bold text-white">
        <Eye className="h-3.5 w-3.5" aria-hidden />
        <span className="tabular-nums">{viewers}</span>
        <span className="sr-only">{t('live.viewers')}</span>
      </div>
    </div>
  );
}

// Whose broadcast it is: their picture and their name, and the title under
// it when there is one.
export function LiveHost({
  username,
  avatar,
  title,
}: {
  username: string;
  avatar?: string | null;
  title?: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <img
        src={avatar || initialsAvatarUrl(username)}
        // The name is written next to it: read aloud once, not twice.
        alt=""
        data-testid="live-host-picture"
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
      <div className="min-w-0">
        <p className="live-text truncate text-sm font-semibold text-white">
          {username}
        </p>
        {title ? (
          <p className="live-text truncate text-xs text-white/80">{title}</p>
        ) : null}
      </div>
    </div>
  );
}

// One comment over the video, as a line and not a bubble: a small picture,
// the name in bold and the words.
export function LiveCommentLine({
  username,
  avatar,
  message,
}: {
  username: string;
  avatar?: string | null;
  message: string;
}) {
  return (
    <span className="flex min-w-0 items-start gap-2 text-left">
      <img
        src={avatar || initialsAvatarUrl(username)}
        alt=""
        className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover"
      />
      <span className="live-text min-w-0 text-sm leading-snug text-white wrap-break-word">
        <span className="font-semibold">{username}</span>{' '}
        <span className="text-white/90">{message}</span>
      </span>
    </span>
  );
}

// The one sheet: it opens from the bottom and never covers more than about
// two thirds of the screen, so the video stays in sight. It is solid: nothing
// of the screen under it shows through. A tap outside closes it.
export function LiveSheet({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  // The same trap the shared dialog uses: the keyboard stays inside the
  // sheet, Escape closes it, and the focus goes back where it was.
  const sheetRef = useFocusTrap<HTMLDivElement>(isOpen, undefined, {
    onEscape: onClose,
  });

  if (!isOpen) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-60 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.close')}
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[66%] flex-col rounded-t-3xl border-t border-white/10 bg-surface-elevated pb-(--live-bottom) shadow-[0_-12px_40px_rgba(0,0,0,0.45)] animate-in slide-in-from-bottom-8 duration-200"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <h3
            id={titleId}
            className="flex min-w-0 items-center gap-2 text-base font-semibold text-white"
          >
            {icon}
            <span className="truncate">{title}</span>
          </h3>
          <LiveControl label={t('common.close')} onClick={onClose}>
            <X className="h-5 w-5" aria-hidden />
          </LiveControl>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {children}
        </div>
        {footer ? <div className="px-4 pt-2">{footer}</div> : null}
      </div>
    </div>
  );
}
