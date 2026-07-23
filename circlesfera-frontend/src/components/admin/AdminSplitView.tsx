import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
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
      className={`flex flex-col lg:flex-row min-h-0 lg:h-[calc(100vh-12rem)] lg:border-t lg:border-white/5 ${className || ''}`}
    >
      <section
        aria-label={
          listAriaLabel || listTitle || t('admin.split.list_region', 'Lista')
        }
        className={`
          flex flex-col min-h-0 min-w-0
          lg:w-[min(100%,360px)] xl:w-[380px] lg:shrink-0 lg:border-r lg:border-white/5 lg:overflow-hidden
          ${hasSelection ? 'hidden lg:flex' : 'flex'}
        `}
      >
        {listTitle && (
          <div className="px-1 py-2.5 border-b border-white/5 shrink-0 hidden lg:block">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {listTitle}
            </h3>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-0 lg:pr-3 lg:pt-2">
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
          <div className="lg:hidden shrink-0 px-1 pb-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              className="min-h-11 gap-2 text-gray-300 hover:text-white px-2"
            >
              <ArrowLeft size={18} />
              {t('common.back', 'Volver')}
            </Button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar lg:pl-4 lg:pt-2">
          {hasSelection
            ? detail
            : (emptyDetail ?? (
                <div className="h-full min-h-48 flex items-center justify-center p-6 text-center text-sm text-gray-500">
                  {t(
                    'admin.split.select_item',
                    'Selecciona un elemento de la lista',
                  )}
                </div>
              ))}
        </div>
      </section>
    </div>
  );
}
