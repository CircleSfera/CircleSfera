import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export interface SegmentedItem<T extends string> {
  value: T;
  label: string;
  /** A destination: the item is then a link, not a button. */
  to?: string;
}

interface SegmentedControlProps<T extends string> {
  items: readonly SegmentedItem<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** Names the moving pill, so two controls on a page do not share it. */
  id: string;
  label?: string;
  className?: string;
}

/**
 * The floating glass switcher of the app: the choices in a dark pill, the
 * chosen one on a lighter pill that slides between them.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  id,
  label,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset draws its own frame; this is a group of choices
    <div
      role="group"
      aria-label={label}
      className={`inline-flex max-w-full items-center gap-1 rounded-full border border-white/12 bg-black/75 p-1 shadow-2xl backdrop-blur-md ${className}`}
    >
      {items.map((item) => {
        const active = item.value === value;
        const itemClass = `relative min-h-11 px-6 inline-flex items-center text-sm font-bold rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 ${
          active ? 'text-white' : 'text-gray-400 hover:text-white'
        }`;
        const content = (
          <>
            {active && (
              <motion.div
                layoutId={id}
                className="absolute inset-0 rounded-full bg-white/15 border border-white/20 shadow-inner"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10 whitespace-nowrap">
              {item.label}
            </span>
          </>
        );
        return item.to ? (
          <Link
            key={item.value}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={itemClass}
          >
            {content}
          </Link>
        ) : (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(item.value)}
            className={itemClass}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
