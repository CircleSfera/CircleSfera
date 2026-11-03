import { GripVertical } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import BrandAmbientBackground from '../common/BrandAmbientBackground';
import { CREATE_FULL_SCREEN, CREATE_PRIMARY } from './createStyles';
import { dropIndex } from './frameTimeline';

/** One card of the order sheet: what it shows and how it is named. */
export interface OrderItem {
  key: string;
  picture: ReactNode;
  label: string;
  detail?: string;
}

export interface MediaOrderSheetProps {
  title: string;
  /** The name of the move button of a card, given the card's label. */
  moveLabel: (label: string) => string;
  items: OrderItem[];
  onMove: (from: number, to: number) => void;
  onDone: () => void;
  testId?: string;
}

/**
 * Items one under another, each its own card, to put them in order: a card
 * is dragged up or down by its grip, or moved with the arrow keys on it. A
 * Frame's clips and a post's carousel are ordered here.
 */
export default function MediaOrderSheet({
  title,
  moveLabel,
  items,
  onMove,
  onDone,
  testId,
}: MediaOrderSheetProps) {
  const { t } = useTranslation();
  const cards = useRef<Array<HTMLLIElement | null>>([]);
  const [drag, setDrag] = useState<{
    from: number;
    startY: number;
    y: number;
    to: number;
  } | null>(null);

  const middles = () =>
    cards.current.slice(0, items.length).map((card) => {
      const box = card?.getBoundingClientRect();
      return box ? box.top + box.height / 2 : 0;
    });

  // On the page itself: a screen that moves (the composer's steps) would
  // otherwise hold it inside its own box.
  return createPortal(
    <div
      className={`${CREATE_FULL_SCREEN} flex flex-col text-white`}
      data-testid={testId}
    >
      <BrandAmbientBackground placement="story" />
      <div className="relative flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onDone}
          className={`${CREATE_PRIMARY} min-h-11 px-5`}
        >
          {t('createPost.edit.done')}
        </button>
      </div>
      <ol
        className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]"
        style={{ touchAction: drag ? 'none' : undefined }}
      >
        {items.map((item, index) => {
          const lifted = drag?.from === index;
          return (
            <li
              key={item.key}
              ref={(card) => {
                cards.current[index] = card;
              }}
              className={`flex items-center gap-3 rounded-2xl border p-3 transition-shadow ${
                lifted
                  ? 'relative z-10 border-white/40 bg-surface-raised shadow-2xl'
                  : 'border-white/10 bg-white/6'
              } ${
                drag && drag.to === index && !lifted
                  ? drag.to < drag.from
                    ? 'shadow-[0_-3px_0_0_var(--color-brand-primary)]'
                    : 'shadow-[0_3px_0_0_var(--color-brand-primary)]'
                  : ''
              }`}
              style={{
                transform: lifted
                  ? `translateY(${drag.y - drag.startY}px) scale(1.02)`
                  : undefined,
              }}
            >
              <button
                type="button"
                aria-label={moveLabel(item.label)}
                aria-keyshortcuts="ArrowUp ArrowDown"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') onMove(index, index - 1);
                  else if (e.key === 'ArrowDown') onMove(index, index + 1);
                  else return;
                  e.preventDefault();
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setDrag({
                    from: index,
                    startY: e.clientY,
                    y: e.clientY,
                    to: index,
                  });
                }}
                onPointerMove={(e) => {
                  if (!drag) return;
                  setDrag({
                    ...drag,
                    y: e.clientY,
                    to: dropIndex(middles(), e.clientY, drag.from),
                  });
                }}
                onPointerUp={() => {
                  if (drag && drag.to !== drag.from) onMove(drag.from, drag.to);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
                className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-white/70 active:cursor-grabbing"
              >
                <GripVertical size={20} aria-hidden />
              </button>
              {item.picture}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.label}</p>
                {item.detail ? (
                  <p className="text-xs tabular-nums text-white/60">
                    {item.detail}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>,
    document.body,
  );
}
