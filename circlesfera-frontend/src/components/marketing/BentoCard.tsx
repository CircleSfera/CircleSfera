import type { LucideIcon } from 'lucide-react';
import { type HTMLAttributes, type MouseEvent, useRef, useState } from 'react';

export interface BentoCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  icon: LucideIcon;
  className?: string;
  size?: 'small' | 'large' | 'tall';
}

export function BentoCard({
  title,
  description,
  icon: Icon,
  className = '',
  size = 'small',
  ...props
}: BentoCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseEnter = () => setOpacity(1);
  const handleMouseLeave = () => setOpacity(0);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: purely decorative hover effect
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative rounded-3xl overflow-hidden shadow-2xl transition-all duration-500 flex flex-col border border-white/10 hover:border-white/20 bg-white/1 backdrop-blur-3xl ${
        size === 'large'
          ? 'col-span-1 md:col-span-2 h-full'
          : size === 'tall'
            ? 'col-span-1 md:row-span-2 h-full'
            : 'col-span-1 h-full'
      } ${className}`}
      {...props}
    >
      {/* 1. Spotlight Effect */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(255,255,255,0.06), transparent 40%)`,
        }}
      />

      {/* 2. Glass noise texture */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* 3. Subtle inner glow on hover */}
      <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5 group-hover:ring-white/10 transition-colors pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-between h-full p-6 md:p-8">
        {/* Icon in Glass Capsule */}
        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shadow-inner text-white/80 group-hover:scale-110 group-hover:text-white group-hover:bg-white/10 transition-all duration-500 backdrop-blur-md">
          <Icon size={20} strokeWidth={1.5} />
        </div>

        <div className="mt-8">
          {/* Metallic Typography */}
          <h3
            className={`font-bold mb-3 tracking-tight wrap-break-word text-transparent bg-clip-text bg-linear-to-b from-white to-white/70 ${size === 'large' ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'}`}
          >
            {title}
          </h3>
          <p className="text-sm md:text-base text-white/40 group-hover:text-white/60 transition-colors duration-500 leading-relaxed font-medium">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
