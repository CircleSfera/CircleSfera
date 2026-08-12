import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { useAdminEscapeClear } from './useAdminEscapeClear';

interface AdminSplitViewProps {
  hasSelection: boolean;
  onBack?: () => void;
  /** Called on Escape when hasSelection — prefer over per-tab listeners */
  onClearSelection?: () => void;
  list: ReactNode;
  detail: ReactNode;
  listTitle?: string;
  listAriaLabel?: string;
  detailAriaLabel?: string;
  /** Shown on desktop when nothing is selected */
  emptyDetail?: ReactNode;
  className?: string;
}

/**
 * Master-detail layout: one pane at a time on mobile, two columns on lg+.
 * Flush panes — subtle dividers, no heavy nested cards.
 */
export function AdminSplitView({
  hasSelection,
  onBack,
  onClearSelection,
  list,
  detail,
  listTitle,
  listAriaLabel,
  detailAriaLabel,
  emptyDetail,
  className,
}: AdminSplitViewProps) {
  const { t } = useTranslation();
  const clear = onClearSelection ?? onBack;
  useAdminEscapeClear(!!hasSelection && !!clear, () => clear?.());

  return (
    <div
      className={`flex flex-col lg:flex-row min-h-0 lg:min-h-[18rem] lg:h-[calc(100vh-13rem)] glass-panel rounded-xl overflow-hidden ${className || ''}`}
    >
      <section
        aria-label={
          listAriaLabel || listTitle || t('admin.split.list_region', 'Lista')
        }
        className={`
          flex flex-col min-h-0 min-w-0
          lg:w-[min(100%,340px)] xl:w-[360px] lg:shrink-0 lg:border-r lg:border-white/5 lg:overflow-hidden
          ${hasSelection ? 'hidden lg:flex' : 'flex'}
        `}
      >
        {listTitle && (
          <div className="px-3 py-2.5 border-b border-white/5 shrink-0 hidden lg:block">
            <h3 className="text-[11px] font-semibold text-white/45 uppercase tracking-wide">
              {listTitle}
            </h3>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 sm:p-2.5 lg:p-3">
          {list}
        </div>
      </section>

      <section
        aria-label={
          detailAriaLabel || t('admin.split.detail_region', 'Detalle')
        }
        aria-live="polite"
        className={`
          flex flex-col min-h-0 min-w-0 flex-1 lg:overflow-hidden
          ${hasSelection ? 'flex' : 'hidden lg:flex'}
        `}
      >
        {hasSelection && onBack && (
          <div className="lg:hidden shrink-0 px-2 pb-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              className="min-h-11 gap-2 text-white/70 hover:text-white px-2"
            >
              <ArrowLeft size={18} />
              {t('common.back', 'Volver')}
            </Button>
          </div>
        )}
        <div
          className={`min-h-0 overflow-y-auto custom-scrollbar p-2.5 sm:p-3 lg:p-4 ${
            hasSelection ? 'flex-1' : 'flex-1 flex items-start justify-start'
          }`}
        >
          {hasSelection
            ? detail
            : (emptyDetail ?? (
                <AdminEmptyState
                  title={t('admin.split.select_item')}
                  compact
                  className="py-4 px-2 items-start text-left mx-0 max-w-none"
                />
              ))}
        </div>
      </section>
    </div>
  );
}
