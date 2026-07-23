import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';

interface AdminListRowAction {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

interface AdminListRowProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  avatar?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: AdminListRowAction[];
  onClick?: () => void;
  className?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  openUp: boolean;
}

/** Touch-friendly card row for mobile admin lists. */
export function AdminListRow({
  title,
  subtitle,
  meta,
  badge,
  avatar,
  primaryAction,
  secondaryActions,
  onClick,
  className,
}: AdminListRowProps) {
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
      const menuWidth = 176; // min-w-44
      const estimatedHeight = Math.min(
        (secondaryActions?.length || 1) * 44 + 8,
        280,
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
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Interactive card uses role=button only when onClick is provided
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: role=button set when onClick provided
    <div
      className={clsx(
        'relative flex items-start gap-3 p-3.5 rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl',
        onClick && 'cursor-pointer hover:bg-white/5 active:bg-white/8',
        className,
      )}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {avatar && <div className="shrink-0 mt-0.5">{avatar}</div>}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">
              {title}
            </div>
            {subtitle && (
              <div className="text-xs text-gray-400 mt-0.5 truncate">
                {subtitle}
              </div>
            )}
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        {meta && (
          <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
            {meta}
          </div>
        )}
        {(primaryAction ||
          (secondaryActions && secondaryActions.length > 0)) && (
          // Stop row click when interacting with actions
          // biome-ignore lint/a11y/noStaticElementInteractions: action bar only stops propagation
          <div
            className="mt-3 flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {primaryAction}
            {secondaryActions && secondaryActions.length > 0 && (
              <div className="relative ml-auto">
                <Button
                  ref={triggerRef}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-11 h-11 text-gray-400 hover:text-white"
                  aria-label="Más acciones"
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
                      className="min-w-44 py-1 rounded-xl border border-white/10 bg-[rgb(22,22,24)] shadow-2xl"
                    >
                      {secondaryActions.map((action) => (
                        <button
                          type="button"
                          role="menuitem"
                          key={action.label}
                          disabled={action.disabled}
                          onClick={(e) => {
                            action.onClick(e);
                            setMenuOpen(false);
                          }}
                          className={clsx(
                            'w-full text-left px-3.5 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 min-h-11',
                            action.variant === 'danger'
                              ? 'text-red-400 hover:bg-red-500/10'
                              : 'text-gray-200 hover:bg-white/5',
                          )}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )}
              </div>
            )}
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
  /** Mobile cards */
  mobile: React.ReactNode;
  /** Desktop table (already wrapped in Table or raw) */
  desktop: React.ReactNode;
  className?: string;
}

/** Renders card stack on mobile and table on desktop. */
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
      <AdminEmptyState
        className={className}
        icon={emptyIcon}
        title={resolvedEmptyTitle}
        description={resolvedEmptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={className}>
      <div className="lg:hidden space-y-2">{mobile}</div>
      <div className="hidden lg:block">{desktop}</div>
    </div>
  );
}
