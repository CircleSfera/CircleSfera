import { clsx } from 'clsx';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Card } from '../ui';

// The pieces every page of the creator area is drawn with. Each is a card of
// its own or plain content of the page: never a card inside a card.

// A row of figures: two per row on a phone, four on desktop.
export function CreatorFigures({
  children,
  five = false,
}: {
  children: ReactNode;
  // Five figures of one kind share a row on desktop.
  five?: boolean;
}) {
  return (
    <div
      className={clsx(
        'grid grid-cols-2 gap-3',
        five ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
      )}
    >
      {children}
    </div>
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
  // What the section explains about itself, under its heading.
  hint?: string;
  // The one thing that can be done with the section as a whole.
  action?: ReactNode;
  children: ReactNode;
}

export function CreatorSection({
  title,
  link,
  hint,
  action,
  children,
}: SectionProps) {
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
        {action}
      </div>
      {hint ? (
        <p className="-mt-2 mb-3 text-xs text-white/50 leading-relaxed">
          {hint}
        </p>
      ) : null}
      {children}
    </section>
  );
}

interface RowProps {
  media?: ReactNode;
  title: string;
  // The facts, in words: a line each on a phone, one line on desktop.
  facts?: string[];
  // Something short at the end of the row, such as an amount.
  badge?: ReactNode;
  // The state of the item: under its facts on a phone, at the end on desktop.
  state?: ReactNode;
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
  state,
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
        {state ? <span className="mt-1.5 flex md:hidden">{state}</span> : null}
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
      {state ? <span className="hidden md:flex shrink-0">{state}</span> : null}
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

// The state of an item, in words. The filled one is the state that is on.
export function CreatorBadge({
  children,
  on = false,
}: {
  children: ReactNode;
  on?: boolean;
}) {
  return (
    <span
      className={clsx(
        'shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap',
        on
          ? 'bg-brand-primary/15 border-brand-primary/30 text-brand-primary-text'
          : 'bg-white/5 border-white/10 text-white/60',
      )}
    >
      {children}
    </span>
  );
}

// The pages of a list. Nothing when the list fits in one.
export function CreatorPager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <Button
        variant="ghost"
        size="compact"
        className="min-h-11"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        {t('creator.posts.prev')}
      </Button>
      <span className="text-xs text-white/60 px-2 tabular-nums">
        {t('creator.pager.position', { page, total: totalPages })}
      </span>
      <Button
        variant="ghost"
        size="compact"
        className="min-h-11"
        disabled={page >= totalPages}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
      >
        {t('creator.posts.next')}
      </Button>
    </div>
  );
}
