import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { ADMIN_PAGE_LIST_STATE, AdminEmptyState } from './AdminEmptyState';

interface AdminListRowAction {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  icon?: LucideIcon;
  // Visual separator above this item (e.g. before destructive)
  dividerBefore?: boolean;
}

interface AdminListRowProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  avatar?: React.ReactNode;
  primaryAction?: React.ReactNode;
  // From sm the action sits at the right of the row, on its lines, so the
  // row stays two lines tall. On a phone it keeps a line of its own.
  actionBeside?: boolean;
  secondaryActions?: AdminListRowAction[];
  onClick?: () => void;
  className?: string;
  // Marks row as selected for a11y (split views)
  selected?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  openUp: boolean;
}

// The look of a row that is a card of its own on a page, not inside a pane.
// Roomy under the thumb on a phone, dense where a list is read with a pointer.
export const ADMIN_PAGE_ROW =
  'rounded-xl border-white/10 bg-white/5 p-4 sm:px-4 sm:py-2.5';
export { ADMIN_PAGE_LIST_STATE };

// Touch-friendly card row for mobile admin lists.
export function AdminListRow({
  title,
  subtitle,
  meta,
  badge,
  avatar,
  primaryAction,
  actionBeside = false,
  secondaryActions,
  onClick,
  className,
  selected,
}: AdminListRowProps) {
  const { t } = useTranslation();
  const detailsId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) {
      setMenuPos(null);
      return;
    }

    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 220;
      const estimatedHeight = Math.min(
        (secondaryActions?.length || 1) * 44 + 24,
        360,
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < estimatedHeight + 12 && rect.top > spaceBelow;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      setMenuPos({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left,
        openUp,
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuOpen, secondaryActions?.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // A dialog over the menu takes the key first.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      // Otherwise the menu is what is on top: the key closes it and stops
      // there, so the record under it stays open.
      e.preventDefault();
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Interactive card uses role=button only when onClick is provided
  // The menu of the row. With a button of its own on the row it sits on the
  // line of that button; with none, beside the state, so that no line is
  // kept for the menu alone.
  const menu =
    secondaryActions && secondaryActions.length > 0 ? (
      // The button keeps its 44 px to press; from 640 px it does not make
      // the row taller than its two lines.
      <div className="relative sm:-my-2">
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="icon"
          className="w-11 h-11 text-white/50 hover:text-white"
          aria-label={t('admin.shared.more_actions')}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal size={18} />
        </Button>
        {menuOpen &&
          menuPos &&
          createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: 'fixed',
                top: menuPos.openUp ? undefined : menuPos.top,
                bottom: menuPos.openUp
                  ? window.innerHeight - menuPos.top
                  : undefined,
                left: menuPos.left,
                zIndex: 100,
              }}
              className={clsx(
                'min-w-52 py-1.5 rounded-2xl overflow-hidden',
                'border border-white/10 shadow-2xl',
                'bg-linear-to-br from-[rgba(18,12,32,0.96)] to-[rgba(10,8,20,0.98)]',
                'backdrop-blur-xl saturate-150',
                'shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(136,76,255,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]',
              )}
            >
              {secondaryActions.map((action) => {
                const Icon = action.icon;
                const isDanger = action.variant === 'danger';
                return (
                  <div key={action.label}>
                    {action.dividerBefore && (
                      <div className="mx-3 my-1.5 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={action.disabled}
                      onClick={(e) => {
                        // The entry goes away with the menu: its button takes
                        // the focus first, so a dialog the action opens gives
                        // it back there when it closes.
                        triggerRef.current?.focus();
                        action.onClick(e);
                        setMenuOpen(false);
                      }}
                      className={clsx(
                        'button-alone flex items-center gap-2.5 px-3 py-2 text-sm font-medium tracking-tight transition-colors disabled:opacity-40 min-h-10',
                        isDanger
                          ? 'text-red-400 hover:bg-red-500/10'
                          : 'text-white hover:bg-white/6',
                      )}
                    >
                      {Icon ? (
                        <span
                          className={clsx(
                            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border',
                            isDanger
                              ? 'bg-red-500/10 border-red-500/20 text-red-400'
                              : 'bg-white/5 border-white/10 text-white/60',
                          )}
                        >
                          <Icon size={14} />
                        </span>
                      ) : null}
                      <span className="truncate">{action.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )}
      </div>
    ) : null;

  return (
    // A row that opens something holds one real button, its title: that is
    // what the keyboard and a screen reader use, and the menu beside it is
    // its sibling, not inside it. The card itself only takes the pointer, so
    // it can be pressed anywhere.
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer convenience; the title button is the control
    // biome-ignore lint/a11y/useKeyWithClickEvents: the title button takes the keyboard
    <div
      data-admin-row
      onClick={onClick}
      className={clsx(
        'relative flex items-start gap-3 sm:gap-2.5 p-3.5 sm:p-2.5 rounded-lg border transition-colors',
        selected
          ? 'bg-brand-primary/15 border-brand-primary/30'
          : 'border-white/5 bg-white/2',
        onClick &&
          !selected &&
          'cursor-pointer hover:bg-white/4 active:bg-white/6 hover:border-white/10',
        onClick && selected && 'cursor-pointer',
        className,
      )}
    >
      {avatar && <div className="shrink-0 mt-0.5">{avatar}</div>}

      <div
        className={clsx(
          'flex-1 min-w-0',
          actionBeside && 'sm:flex sm:items-center sm:gap-3',
        )}
      >
        <div
          className={clsx(
            'flex items-start sm:items-center justify-between gap-2',
            actionBeside && 'sm:flex-1 sm:min-w-0',
          )}
        >
          <div className="min-w-0 flex-1">
            {onClick ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                aria-current={selected ? 'true' : undefined}
                aria-describedby={subtitle || meta ? detailsId : undefined}
                className="block max-w-full text-left text-[15px] sm:text-sm font-semibold text-white truncate cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                {title}
              </button>
            ) : (
              <div className="text-[15px] sm:text-sm font-semibold text-white truncate">
                {title}
              </div>
            )}
            {/* What the row is and when share a line while they fit, so a
                row is two lines tall; in a narrow row the second wraps. */}
            {(subtitle || meta) && (
              <div
                id={detailsId}
                className="mt-1 sm:mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:gap-y-0.5 text-[13px] sm:text-xs"
              >
                {subtitle && (
                  <div className="min-w-0 max-w-full text-white/50 truncate">
                    {subtitle}
                  </div>
                )}
                {meta && (
                  <div className="min-w-0 max-w-full text-white/50 flex flex-wrap gap-x-3 gap-y-1 sm:gap-y-0.5">
                    {meta}
                  </div>
                )}
              </div>
            )}
          </div>
          {(badge || (!primaryAction && menu)) && (
            // biome-ignore lint/a11y/noStaticElementInteractions: only stops the row click
            // biome-ignore lint/a11y/useKeyWithClickEvents: no key is taken here, so Escape reaches the page
            <div
              className="shrink-0 flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {badge}
              {!primaryAction && menu}
            </div>
          )}
        </div>
        {primaryAction && (
          // Stop row click when interacting with actions
          // biome-ignore lint/a11y/noStaticElementInteractions: action bar only stops propagation
          // biome-ignore lint/a11y/useKeyWithClickEvents: no key is taken here, so Escape reaches the page
          <div
            className={clsx(
              'mt-2 flex flex-wrap items-center gap-2',
              actionBeside && 'sm:mt-0 sm:shrink-0',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {primaryAction}
            {menu && <div className="ml-auto">{menu}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

interface AdminListProps {
  loading?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  emptyIcon?: LucideIcon;
  // Mobile cards
  mobile: React.ReactNode;
  // Desktop table (already wrapped in Table or raw)
  desktop: React.ReactNode;
  className?: string;
}

// Renders card stack on mobile and table on desktop.
export function AdminList({
  loading,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptyIcon,
  mobile,
  desktop,
  className,
}: AdminListProps) {
  const { t } = useTranslation();
  const resolvedEmptyTitle = emptyTitle ?? t('admin.table.empty_title');
  const resolvedEmptyDescription =
    emptyDescription ?? t('admin.table.empty_description');

  if (loading) {
    return (
      <div className={clsx('space-y-2', className)}>
        {['a', 'b', 'c', 'd'].map((id) => (
          <div
            key={id}
            className="h-20 rounded-xl border border-white/10 bg-white/5 animate-pulse lg:h-14"
          />
        ))}
      </div>
    );
  }

  if (isEmpty) {
    return (
      // A page list with no rows is one card.
      <div className={clsx(ADMIN_PAGE_LIST_STATE, className)}>
        <AdminEmptyState
          icon={emptyIcon}
          title={resolvedEmptyTitle}
          description={resolvedEmptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="lg:hidden space-y-2">{mobile}</div>
      <div className="hidden lg:block">{desktop}</div>
    </div>
  );
}
