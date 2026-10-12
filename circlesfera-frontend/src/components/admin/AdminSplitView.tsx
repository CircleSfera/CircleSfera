import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { AdminPageListContext } from './AdminEmptyState';
import { useAdminEscapeClear } from './useAdminEscapeClear';

// The important marks win over the unlayered rules of the glass panel.
const UNBOXED_ON_PHONE =
  'max-lg:bg-transparent! max-lg:border-0! max-lg:shadow-none! max-lg:backdrop-filter-none! max-lg:rounded-none max-lg:overflow-visible';
const UNBOXED_ON_DESKTOP =
  'lg:bg-transparent! lg:border-0! lg:shadow-none! lg:backdrop-filter-none! lg:rounded-none lg:overflow-visible';

interface AdminSplitViewProps {
  hasSelection: boolean;
  onBack?: () => void;
  // Called on Escape when hasSelection — prefer over per-tab listeners
  onClearSelection?: () => void;
  list: ReactNode;
  detail: ReactNode;
  // A heading over the list on desktop. Not the title of the page again:
  // a list that has nothing more to say names itself with listAriaLabel.
  listTitle?: string;
  listAriaLabel?: string;
  detailAriaLabel?: string;
  // Something to show beside the list on desktop while nothing is selected.
  // Without it the list takes the whole width until a row is chosen.
  emptyDetail?: ReactNode;
  className?: string;
}

// Master-detail layout. On a phone one pane at a time. On lg+ the list uses
// the width until a row is chosen, then the record opens beside it.
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
  // Two columns on desktop: a record is open, or the caller fills the side.
  const twoPanes = hasSelection || emptyDetail !== undefined;

  return (
    <div
      // The list alone is a stack of cards of its own: the pane around them
      // is not drawn, so there is no card inside a card.
      className={`flex flex-col lg:flex-row min-h-0 glass-panel rounded-xl overflow-hidden ${
        twoPanes ? 'lg:min-h-[18rem] lg:h-[calc(100vh-13rem)]' : ''
      } ${
        hasSelection
          ? ''
          : `${UNBOXED_ON_PHONE} ${twoPanes ? '' : UNBOXED_ON_DESKTOP}`
      } ${className || ''}`}
    >
      <section
        aria-label={listAriaLabel || listTitle || t('admin.split.list_region')}
        className={`
          flex flex-col min-h-0 min-w-0
          ${
            twoPanes
              ? 'lg:w-[min(100%,340px)] xl:w-[360px] lg:shrink-0 lg:border-r lg:border-white/5 lg:overflow-hidden'
              : 'lg:flex-1'
          }
          ${hasSelection ? 'hidden lg:flex' : 'flex'}
        `}
      >
        {listTitle && (
          <div
            className={`shrink-0 hidden lg:block ${
              twoPanes ? 'px-3 py-2.5 border-b border-white/5' : 'px-1 pb-2'
            }`}
          >
            <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide">
              {listTitle}
            </h3>
          </div>
        )}
        <div
          className={`flex-1 min-h-0 ${
            twoPanes ? 'overflow-y-auto custom-scrollbar lg:p-3' : ''
          }`}
        >
          <AdminPageListContext.Provider value={!twoPanes}>
            {list}
          </AdminPageListContext.Provider>
        </div>
      </section>

      <section
        aria-label={detailAriaLabel || t('admin.split.detail_region')}
        aria-live="polite"
        className={`
          flex flex-col min-h-0 min-w-0 flex-1 lg:overflow-hidden
          ${hasSelection ? 'flex' : twoPanes ? 'hidden lg:flex' : 'hidden'}
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
              {t('common.back')}
            </Button>
          </div>
        )}
        <div
          className={`min-h-0 overflow-y-auto custom-scrollbar p-2.5 sm:p-3 lg:p-4 ${
            hasSelection ? 'flex-1' : 'flex-1 flex items-start justify-start'
          }`}
        >
          {hasSelection ? detail : emptyDetail}
        </div>
      </section>
    </div>
  );
}
