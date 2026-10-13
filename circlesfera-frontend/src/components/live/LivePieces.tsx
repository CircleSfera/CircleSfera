import { Eye, X } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

// The pieces every Live screen is made of: the frame the video fills, the
// one shape of control, the mark that says the broadcast is live, and the
// one sheet that opens from the bottom.

// The frame. On a phone the video is the screen: it reaches every edge, the
// part of the screen a browser draws its own bars over included, and nothing
// of the app shows around it. The controls stay inside the part that is
// really in sight. On a desktop it is an upright frame in the middle.
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
        className="absolute inset-0 select-none overflow-hidden bg-black md:relative md:inset-auto md:h-[88vh] md:w-full md:max-w-105 md:rounded-3xl md:border md:border-white/10 md:shadow-[0_0_60px_rgba(0,0,0,0.9)]"
        onDoubleClick={onDoubleClick}
      >
        <div className="absolute inset-0">{video}</div>
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

// The one control of a Live screen: a round button of glass, 44 px.
export function LiveControl({
  label,
  tone = 'glass',
  className = '',
  children,
  ...button
}: {
  label: string;
  // glass: the usual one. on: something switched off that is now the state
  // to notice (a muted microphone). brand: the one action of a form.
  tone?: 'glass' | 'on' | 'brand';
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  const tones = {
    glass: 'live-glass text-white',
    on: 'bg-white text-black',
    brand: 'bg-brand-primary text-white',
  };
  return (
    <button
      type="button"
      {...button}
      aria-label={label}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

function clock(seconds: number): string {
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
    <div className="flex items-center gap-2">
      <div className="flex min-h-9 items-center gap-1.5 rounded-full bg-red-600 px-3 text-xs font-bold text-white shadow-lg">
        <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
        <span className="uppercase tracking-wide">{t('live.now')}</span>
        {startedAt ? (
          <span className="tabular-nums font-semibold" data-testid="live-clock">
            {clock((now - startedAt) / 1000)}
          </span>
        ) : null}
      </div>
      <div className="live-glass flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-white">
        <Eye className="h-4 w-4" aria-hidden />
        <span className="tabular-nums">{viewers}</span>
        <span className="sr-only">{t('live.viewers')}</span>
      </div>
    </div>
  );
}

// The one sheet: it opens from the bottom and never covers more than about
// two thirds of the screen, so the video stays in sight. A tap outside
// closes it.
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
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="live-glass-sheet relative flex max-h-[66%] flex-col rounded-t-3xl pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] animate-in slide-in-from-bottom-8 duration-200"
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
