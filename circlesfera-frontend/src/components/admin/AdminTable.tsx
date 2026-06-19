import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Ghost,
} from 'lucide-react';

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
  return (
    <div className="relative w-full">
      <div className="w-full pb-2 overflow-x-auto no-scrollbar">
        <table className="admin-table-responsive w-full text-left border-collapse md:min-w-[900px]">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              {headers.map((h, idx) => (
                <th
                  key={typeof h === 'string' ? h : idx}
                  className={clsx(
                    'px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-normal',
                    columnWidths?.[idx],
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="relative min-h-[200px]">
            {loading ? (
              ['s-1', 's-2', 's-3', 's-4', 's-5'].map((rowId) => (
                <tr
                  key={rowId}
                  className="border-b border-white/5 animate-pulse"
                >
                  {headers.map((h) => (
                    <td key={`${rowId}-${h}`} className="px-4 py-6">
                      <div className="h-4 bg-white/5 rounded-lg w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : isEmpty ? (
              <tr>
                <td colSpan={headers.length} className="py-24">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-4 text-gray-500"
                  >
                    <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center text-gray-600">
                      <Ghost size={32} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-white mb-1">
                        No hay resultados
                      </p>
                      <p className="text-xs max-w-[200px]">
                        No hemos encontrado nada que coincida con tu búsqueda.
                      </p>
                    </div>
                  </motion.div>
                </td>
              </tr>
            ) : (
              <AnimatePresence mode="popLayout">
                {/* 
                  IMPORTANT: children should only contain <tr> elements.
                  The responsive cards are now handled outside or by wrapping the whole table.
                  To fix the user's report, we make the table scrollable horizontally on mobile.
                */}
                {children}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    pending: { color: 'yellow', icon: Clock },
    valid: { color: 'blue', icon: CheckCircle },
    resolved: { color: 'green', icon: CheckCircle },
    dismissed: { color: 'gray', icon: CheckCircle },
    active: { color: 'green', icon: CheckCircle },
    banned: { color: 'red', icon: Clock },
    registered: { color: 'green', icon: CheckCircle },
  };

  const { color, icon: Icon } = config[status.toLowerCase()] || config.pending;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
        `text-${color}-400 bg-${color}-400/10 border border-${color}-400/20`,
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
  const styles: Record<string, string> = {
    success:
      'bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white',
    warning:
      'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-white',
    primary:
      'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white',
    ghost: 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={label}
      aria-label={label}
      className={clsx(
        'rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap active:scale-95',
        iconOnly ? 'p-2' : 'px-3 py-1.5',
        styles[variant],
      )}
    >
      {loading ? (
        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        Icon && <Icon size={14} />
      )}
      {!iconOnly && (!loading ? label : 'Cargando...')}
    </button>
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
  if (!meta || meta.totalPages <= 1) return null;

  return (
    <div className="px-6 py-4 flex items-center justify-between border-t border-white/5 bg-white/2">
      <p className="text-xs text-gray-500">
        Mostrando{' '}
        <span className="text-white font-bold">
          {meta.total > 0 ? (meta.page - 1) * meta.limit + 1 : 0}
        </span>{' '}
        al{' '}
        <span className="text-white font-bold">
          {Math.min(meta.page * meta.limit, meta.total)}
        </span>{' '}
        de <span className="text-white font-bold">{meta.total}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          className="p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          aria-label="Página siguiente"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          className="p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
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
    <div className="relative">
      <label htmlFor="admin-filter-select" className="sr-only">
        {label}
      </label>
      <select
        id="admin-filter-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white/5 border border-white/10 rounded-xl py-2 px-4 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white min-w-[140px]"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#1a1a2e]">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
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
    <div className="relative max-w-md">
      <svg
        aria-hidden="true"
        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5"
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
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-brand-primary transition-colors"
      />
    </div>
  );
}

// ─── Toast System ───────────────────────────────────────────────────

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            'px-6 py-4 rounded-2xl text-[13px] font-black tracking-wide shadow-2xl animate-in slide-in-from-right-10 duration-500 backdrop-blur-2xl relative overflow-hidden border border-white/10 group',
            toast.type === 'success' && 'bg-green-500/10 text-white',
            toast.type === 'error' && 'bg-red-500/10 text-white',
            toast.type === 'info' && 'bg-white/5 text-white',
          )}
        >
          {/* Brand Accent Bar (Vertical) */}
          <div
            className={clsx(
              'absolute left-0 top-0 bottom-0 w-1',
              toast.type === 'success' && 'bg-green-500',
              toast.type === 'error' && 'bg-red-500',
              toast.type === 'info' && 'bg-brand-primary',
            )}
          />

          <div className="flex items-center gap-3">{toast.message}</div>
        </div>
      ))}
    </div>
  );
}
