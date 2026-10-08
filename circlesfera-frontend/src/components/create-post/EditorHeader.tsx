import { Check, ChevronLeft, Loader2, X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The one top bar of the content editor: composer steps, their sub-screens,
 * the photo editor, the frame trim and the story composer.
 *
 * - Leading control on the left: a back arrow where leaving keeps the work
 *   (steps and sub-screens), an X where leaving discards it (the editors).
 * - Title, or other content, centred between two sides of equal width.
 * - Main action on the right.
 * - Every control is 44 px.
 */

const controlBase =
  'min-w-11 min-h-11 flex items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25';

export const editorIconButton = `${controlBase} bg-white/10 text-white hover:bg-white/16`;

interface EditorHeaderProps {
  leading: 'back' | 'close';
  leadingLabel: string;
  onLeading: () => void;
  title?: ReactNode;
  titleId?: string;
  subtitle?: string;
  /** Shown instead of the title, for example undo and redo. */
  center?: ReactNode;
  trailing?: ReactNode;
  /**
   * `bar`: a bordered bar on the editor surface (steps and sub-screens).
   * `overlay`: transparent, over the media, with room for the status bar
   * (photo editor, frame trim, story composer).
   */
  surface?: 'bar' | 'overlay';
  sticky?: boolean;
}

const SURFACE = {
  bar: 'px-4 py-1 bg-surface-elevated/95 backdrop-blur-md border-b border-white/8',
  overlay:
    'px-4 pb-1.5 pt-[max(0.5rem,calc(env(safe-area-inset-top,0px)+0.25rem))] bg-linear-to-b from-black via-black/90 to-transparent',
} as const;

export default function EditorHeader({
  leading,
  leadingLabel,
  onLeading,
  title,
  titleId,
  subtitle,
  center,
  trailing,
  surface = 'bar',
  sticky = false,
}: EditorHeaderProps) {
  const LeadingIcon = leading === 'close' ? X : ChevronLeft;

  return (
    <header
      className={`${sticky ? 'sticky top-0' : 'relative'} z-30 shrink-0 min-h-13 grid grid-cols-[1fr_auto_1fr] items-center gap-2 ${SURFACE[surface]}`}
    >
      <div className="flex justify-start">
        <button
          type="button"
          onClick={onLeading}
          className={editorIconButton}
          aria-label={leadingLabel}
        >
          <LeadingIcon size={18} strokeWidth={2} />
        </button>
      </div>

      <div className="min-w-0 text-center">
        {center ?? (
          <>
            <h1
              id={titleId}
              className="font-semibold text-sm tracking-tight text-white truncate"
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="text-white/45 text-xs leading-snug line-clamp-2">
                {subtitle}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="flex justify-end items-center gap-1.5">{trailing}</div>
    </header>
  );
}

interface EditorHeaderActionProps {
  label: string;
  onClick: () => void;
  /**
   * `final`: finishes something (share, done). `step`: moves to the next step.
   * `plain`: a secondary action next to the main one.
   */
  kind?: 'final' | 'step' | 'plain';
  disabled?: boolean;
  isPending?: boolean;
  /** A check mark after the label, for actions that confirm an edit. */
  withCheck?: boolean;
}

const ACTION = {
  final:
    'bg-linear-to-r from-brand-primary to-brand-blue text-white shadow-md shadow-brand-primary/20',
  step: 'text-brand-primary hover:text-white hover:bg-brand-primary/15 border border-brand-primary/35',
  plain: 'bg-white/10 text-white hover:bg-white/16',
} as const;

export function EditorHeaderAction({
  label,
  onClick,
  kind = 'final',
  disabled = false,
  isPending = false,
  withCheck = false,
}: EditorHeaderActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isPending}
      aria-label={label}
      className={`min-w-14 min-h-11 px-3.5 flex items-center justify-center gap-1 rounded-full font-bold text-xs transition-all duration-200 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 ${ACTION[kind]}`}
    >
      {isPending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <>
          {label}
          {withCheck ? <Check size={14} strokeWidth={2.5} /> : null}
        </>
      )}
    </button>
  );
}
