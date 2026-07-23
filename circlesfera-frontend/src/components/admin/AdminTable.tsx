import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Ghost,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select } from '../ui';

// ─── Table ──────────────────────────────────────────────────────────

interface TableProps {
  headers: (string | React.ReactNode)[];
  columnWidths?: string[];
  children: React.ReactNode;
  loading: boolean;
  isEmpty: boolean;
}

export function Table({
  headers,
  columnWidths,
  children,
  loading,
  isEmpty,
}: TableProps) {
  const { t } = useTranslation();

  return (
    <div className="relative w-full overflow-hidden border-t border-white/5">
      <div className="w-full overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-0 lg:min-w-150">
          <thead className="border-b border-white/5">
            <tr>
              {headers.map((h, idx) => (
                <th
                  key={typeof h === 'string' ? h : idx}
                  className={clsx(
                    'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap',
                    columnWidths?.[idx],
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-medium text-xs text-gray-200">
            {loading ? (
              ['s-1', 's-2', 's-3', 's-4', 's-5'].map((rowId) => (
                <tr
                  key={rowId}
                  className="animate-pulse hover:bg-white/[0.03] transition-colors"
                >
                  {headers.map((h) => (
                    <td key={`${rowId}-${h}`} className="px-3 py-4">
                      <div className="h-4 bg-white/10 rounded-md w-full max-w-35" />
                    </td>
                  ))}
                </tr>
              ))
            ) : isEmpty ? (
              <tr>
                <td colSpan={headers.length} className="py-20">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-3 text-gray-500"
                  >
                    <div className="w-14 h-14 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-gray-400">
                      <Ghost size={28} />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-white text-sm mb-1">
                        {t('admin.table.empty_title')}
                      </p>
                      <p className="text-xs text-gray-400 max-w-xs">
                        {t('admin.table.empty_description')}
                      </p>
                    </div>
                  </motion.div>
                </td>
              </tr>
            ) : (
              <AnimatePresence mode="popLayout">{children}</AnimatePresence>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────

const STATUS_STYLES: Record<
  string,
  { className: string; icon: React.ElementType }
> = {
  pending: {
    className: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    icon: Clock,
  },
  valid: {
    className: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    icon: CheckCircle,
  },
  resolved: {
    className: 'text-green-400 bg-green-400/10 border-green-400/20',
    icon: CheckCircle,
  },
  dismissed: {
    className: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
    icon: CheckCircle,
  },
  active: {
    className: 'text-green-400 bg-green-400/10 border-green-400/20',
    icon: CheckCircle,
  },
  banned: {
    className: 'text-red-400 bg-red-400/10 border-red-400/20',
    icon: Clock,
  },
  registered: {
    className: 'text-green-400 bg-green-400/10 border-green-400/20',
    icon: CheckCircle,
  },
};

export function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_STYLES[status.toLowerCase()] || STATUS_STYLES.pending;
  const Icon = entry.icon;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border',
        entry.className,
      )}
    >
      <Icon size={12} />
      {status}
    </span>
  );
}

// ─── Action Button ──────────────────────────────────────────────────

interface ActionButtonProps {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  variant: 'success' | 'danger' | 'ghost' | 'warning' | 'primary';
  icon?: React.ElementType;
  disabled?: boolean;
  iconOnly?: boolean;
  loading?: boolean;
}

export function ActionButton({
  onClick,
  label,
  variant,
  icon: Icon,
  disabled = false,
  iconOnly = false,
  loading = false,
}: ActionButtonProps) {
  const { t } = useTranslation();

  // Map ActionButton variants to Button variants
  const variantMap: Record<string, any> = {
    success: 'success',
    danger: 'danger',
    warning: 'warning',
    primary: 'primary',
    ghost: 'ghost',
  };

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      isLoading={loading}
      variant={variantMap[variant] || 'ghost'}
      size={iconOnly ? 'icon' : 'sm'}
      title={label}
      aria-label={label}
      className={clsx(
        'font-semibold text-xs whitespace-nowrap',
        iconOnly
          ? 'w-11 h-11 sm:w-9 sm:h-9 min-w-11 sm:min-w-9'
          : 'min-h-11 sm:min-h-9',
      )}
    >
      {!loading && Icon && (
        <Icon size={14} className={iconOnly ? '' : 'mr-1'} />
      )}
      {!iconOnly && (!loading ? label : t('admin.table.loading'))}
    </Button>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────

interface PaginationProps {
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
}

export function Pagination({ meta, onPageChange }: PaginationProps) {
  const { t } = useTranslation();

  if (!meta) return null;

  const showPager = meta.totalPages > 1;

  return (
    <div className="px-1 sm:px-2 py-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-white/5">
      <p className="text-xs text-gray-500">
        {meta.total === 0
          ? t('admin.table.results_count', { count: 0 })
          : t('admin.table.pagination_from_to', {
              from: (meta.page - 1) * meta.limit + 1,
              to: Math.min(meta.page * meta.limit, meta.total),
              total: meta.total,
            })}
      </p>
      {showPager && (
        <div className="flex items-center gap-2 ml-auto">
          <p className="text-xs text-gray-400 sm:hidden font-semibold">
            {t('admin.table.pagination_page', {
              page: meta.page,
              totalPages: meta.totalPages,
            })}
          </p>
          <Button
            onClick={() => onPageChange(meta.page - 1)}
            disabled={meta.page <= 1}
            variant="secondary"
            size="icon"
            aria-label={t('admin.table.prev_page')}
            className="w-11 h-11 sm:w-8 sm:h-8"
          >
            <ChevronLeft size={18} />
          </Button>
          <Button
            onClick={() => onPageChange(meta.page + 1)}
            disabled={meta.page >= meta.totalPages}
            variant="secondary"
            size="icon"
            aria-label={t('admin.table.next_page')}
            className="w-11 h-11 sm:w-8 sm:h-8"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Filter Dropdown ──────────────────────────────────────────────

interface FilterDropdownProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: FilterDropdownProps) {
  return (
    <Select
      id="admin-filter-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-35"
      aria-label={label}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-surface-raised">
          {opt.label}
        </option>
      ))}
    </Select>
  );
}

// ─── Search Input ───────────────────────────────────────────────────

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: SearchInputProps) {
  return (
    <Input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-md"
      icon={
        <svg
          aria-hidden="true"
          className="text-gray-500 w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      }
    />
  );
}
