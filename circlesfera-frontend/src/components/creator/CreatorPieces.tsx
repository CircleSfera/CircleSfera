import { clsx } from 'clsx';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui';

// The pieces every page of the creator area is drawn with. Each is a card of
// its own or plain content of the page: never a card inside a card.

// A row of figures: two per row on a phone, four on desktop.
export function CreatorFigures({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
  );
}

interface FigureProps {
  label: string;
  value: string;
  // What the figure measures, or how it changed.
  hint?: string;
}

export function CreatorFigure({ label, value, hint }: FigureProps) {
  return (
    <Card variant="glass" className="p-4">
      <p className="text-xs text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-white/50 leading-snug">{hint}</p>
      ) : null}
    </Card>
  );
}

interface SectionProps {
  title: string;
  // Where the rest of it is, when the page shows only a part.
  link?: { label: string; to: string };
  children: ReactNode;
}

export function CreatorSection({ title, link, children }: SectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3 min-h-11">
        <h2 className="text-base font-semibold text-white tracking-tight">
          {title}
        </h2>
        {link ? (
          <Link
            to={link.to}
            className="inline-flex items-center gap-1 min-h-11 px-2 -mr-2 text-sm text-white/60 hover:text-white transition-colors shrink-0"
          >
            {link.label}
            <ChevronRight size={14} aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

interface RowProps {
  media?: ReactNode;
  title: string;
  // The facts, in words: a line each on a phone, one line on desktop.
  facts?: string[];
  badge?: ReactNode;
  // The one visible action; anything else belongs in a menu.
  action?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
}

// A list item: roomy on a phone, two lines on desktop.
export function CreatorRow({
  media,
  title,
  facts,
  badge,
  action,
  onOpen,
  openLabel,
}: RowProps) {
  const body = (
    <>
      {media ? (
        <span className="w-14 h-14 md:w-11 md:h-11 rounded-lg overflow-hidden shrink-0 bg-surface-raised border border-white/10 text-white/40 flex items-center justify-center">
          {media}
        </span>
      ) : null}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-white truncate">
          {title}
        </span>
        {facts?.length ? (
          <span className="block mt-0.5 text-xs text-white/60 md:truncate">
            {facts.map((line, index) => (
              <span key={line} className="block md:inline">
                {index > 0 ? (
                  <span className="hidden md:inline" aria-hidden>
                    {' · '}
                  </span>
                ) : null}
                {line}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <Card
      variant="glass"
      className="flex items-center gap-2 p-3 md:px-3 md:py-2 hover:bg-white/5 transition-colors"
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          className="flex flex-1 min-w-0 items-center gap-3 text-left min-h-11 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-1 min-w-0 items-center gap-3 min-h-11">
          {body}
        </div>
      )}
      {badge}
      {action}
    </Card>
  );
}

interface ChoiceProps<T extends string> {
  label: string;
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

// A choice between views: separate buttons in one row, the chosen one filled.
export function CreatorViewChoice<T extends string>({
  label,
  items,
  value,
  onChange,
}: ChoiceProps<T>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset draws its own frame; this is a group of choices
    <div
      role="group"
      aria-label={label}
      className="flex gap-2 overflow-x-auto no-scrollbar"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={clsx(
              'min-h-11 px-4 rounded-full text-sm font-medium border whitespace-nowrap transition-colors',
              active
                ? 'bg-brand-primary/20 border-brand-primary/40 text-white'
                : 'bg-white/3 border-white/10 text-white/60 hover:text-white hover:bg-white/5',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
