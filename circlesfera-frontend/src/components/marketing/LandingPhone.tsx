import { BatteryFull, Signal, Wifi } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppCapture } from './AppCapture';

/** A phone: metal edge, side buttons, the camera pill and the status bar. */
export function Device({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute -left-0.5 top-28 h-8 w-1 rounded-l-sm bg-white/20" />
      <span className="absolute -left-0.5 top-40 h-14 w-1 rounded-l-sm bg-white/20" />
      <span className="absolute -right-0.5 top-36 h-20 w-1 rounded-r-sm bg-white/20" />
      <div className="relative rounded-[52px] bg-linear-to-b from-white/35 via-white/10 to-white/25 p-0.5 shadow-2xl shadow-black/70">
        <div className="rounded-[50px] bg-black p-2">
          <div className="relative overflow-hidden rounded-[42px] bg-black">
            <div className="relative z-20 flex h-10 items-center justify-between px-6 text-xs font-semibold text-white">
              <span>9:41</span>
              <span className="absolute left-1/2 top-2 h-6 w-20 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/10" />
              <span className="flex items-center gap-1">
                <Signal size={14} />
                <Wifi size={14} />
                <BatteryFull size={18} />
              </span>
            </div>
            {children}
            <div className="flex h-5 items-center justify-center bg-black">
              <span className="h-1 w-28 rounded-full bg-white/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The app itself at the top of the landing: Home on one phone and a Frame
 * on a second one behind it, on wide screens.
 */
export function LandingPhone() {
  return (
    <div className="relative mx-auto w-full max-w-76" aria-hidden="true">
      {/* The mark of the brand behind the phones: circles within circles */}
      <div className="absolute left-1/2 top-1/2 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 h-184 w-184 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/4" />
        <div className="absolute left-1/2 top-1/2 h-144 w-144 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/6" />
        <div className="absolute left-1/2 top-1/2 h-104 w-104 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-primary/20 bg-brand-primary/5" />
      </div>
      <div className="absolute -inset-8 rounded-full bg-linear-to-br from-brand-primary/30 via-brand-blue/20 to-brand-secondary/20 blur-3xl pointer-events-none" />

      <Device className="absolute! -right-40 top-16 hidden w-56 rotate-6 xl:block">
        <AppCapture screen="frames" eager />
      </Device>

      <Device>
        <AppCapture screen="home" eager />
      </Device>
    </div>
  );
}
