import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';

interface AdminSplitViewProps {
  hasSelection: boolean;
  onBack?: () => void;
  list: React.ReactNode;
  detail: React.ReactNode;
  listTitle?: string;
  /** Shown on desktop when nothing is selected */
  emptyDetail?: React.ReactNode;
  className?: string;
}

/**
 * Master-detail layout: one pane at a time on mobile, two columns on lg+.
 * Avoids fixed 100vh calc — uses flex-1 / min-h-0 inside the admin shell.
 */
export function AdminSplitView({
  hasSelection,
  onBack,
  list,
  detail,
  listTitle,
  emptyDetail,
  className,
}: AdminSplitViewProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`flex flex-col lg:flex-row gap-3 sm:gap-4 min-h-0 lg:h-[calc(100vh-12rem)] ${className || ''}`}
    >
      <div
        className={`
          flex flex-col min-h-0 min-w-0
          lg:w-[min(100%,360px)] xl:w-[380px] lg:shrink-0 lg:border lg:border-white/10 lg:rounded-2xl lg:bg-black/30 lg:overflow-hidden
          ${hasSelection ? 'hidden lg:flex' : 'flex'}
        `}
      >
        {listTitle && (
          <div className="px-3 py-2.5 border-b border-white/5 shrink-0 hidden lg:block">
            <h3 className="text-sm font-semibold text-white">{listTitle}</h3>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-0 lg:p-2">
          {list}
        </div>
      </div>

      <div
        className={`
          flex flex-col min-h-0 min-w-0 flex-1
          lg:border lg:border-white/10 lg:rounded-2xl lg:bg-black/30 lg:overflow-hidden
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
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
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
      </div>
    </div>
  );
}
