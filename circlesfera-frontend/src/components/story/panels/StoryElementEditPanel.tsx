import { motion } from 'framer-motion';
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
  Copy,
  HelpCircle,
  Layers,
  Move,
  Palette,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';
import type { PanelTab } from '../storyComposer.types';
import { isPollElement, isQnaElement } from '../storyInteractive';
import StoryElementLayersTab from './StoryElementLayersTab';
import StoryElementStyleTab from './StoryElementStyleTab';
import StoryElementTransformTab from './StoryElementTransformTab';

export type { PanelTab };

export interface StoryElementEditPanelProps {
  selectedElementId: string;
  selectedElement: StoryElement;
  panelTab: PanelTab;
  elements: StoryElement[];
  onPanelTabChange: (tab: PanelTab) => void;
  onDuplicateElement: (id: string) => void;
  onMoveElementLayer: (id: string, direction: 'up' | 'down') => void;
  onUpdateElement: (id: string, updates: Partial<StoryElement>) => void;
  onCommitElements: () => void;
  onRemoveElement: (id: string) => void;
  onSelectedElementIdChange: (id: string | null) => void;
}

export default function StoryElementEditPanel({
  selectedElementId,
  selectedElement,
  panelTab,
  elements,
  onPanelTabChange,
  onDuplicateElement,
  onMoveElementLayer,
  onUpdateElement,
  onCommitElements,
  onRemoveElement,
  onSelectedElementIdChange,
}: StoryElementEditPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      key="element-editor"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.25 }}
      className="px-3 pb-4 space-y-3"
      // One undo step per finished gesture, whatever control made it: a
      // slider released or moved with the keyboard, a button pressed, a text
      // field left. Typing is not a step until the field is left.
      onPointerUp={onCommitElements}
      onClick={onCommitElements}
      onDoubleClick={onCommitElements}
      onBlur={onCommitElements}
      onKeyUp={(event) => {
        const target = event.target as HTMLElement;
        if (target instanceof HTMLInputElement && target.type === 'range') {
          onCommitElements();
        }
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
            {isPollElement(selectedElement) ? (
              <BarChart2 size={15} />
            ) : isQnaElement(selectedElement) ? (
              <HelpCircle size={15} />
            ) : (
              <Smile size={15} />
            )}
          </div>
          {/* Phones have no room for the title next to the actions: the icon
              shows the kind of element and the title stays for screen readers. */}
          <span className="max-sm:sr-only text-[11px] font-bold uppercase tracking-[0.12em] text-white/45 truncate">
            {isPollElement(selectedElement)
              ? t('createPost.storyComposer.edit_poll')
              : isQnaElement(selectedElement)
                ? t('createPost.storyComposer.edit_qna')
                : t('createPost.storyComposer.edit_sticker')}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onDuplicateElement(selectedElementId)}
            title={t('createPost.storyComposer.duplicate')}
            aria-label={t('createPost.storyComposer.duplicate')}
            className="min-h-11 min-w-11 flex items-center justify-center bg-white/4 hover:bg-white/8 text-white/50 hover:text-white/80 rounded-lg border border-white/6 transition-all"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={() => onMoveElementLayer(selectedElementId, 'up')}
            title={t('createPost.storyComposer.bring_forward')}
            aria-label={t('createPost.storyComposer.bring_forward')}
            className="min-h-11 min-w-11 flex items-center justify-center bg-white/4 hover:bg-white/8 text-white/50 hover:text-white/80 rounded-lg border border-white/6 transition-all"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => onMoveElementLayer(selectedElementId, 'down')}
            title={t('createPost.storyComposer.send_backward')}
            aria-label={t('createPost.storyComposer.send_backward')}
            className="min-h-11 min-w-11 flex items-center justify-center bg-white/4 hover:bg-white/8 text-white/50 hover:text-white/80 rounded-lg border border-white/6 transition-all"
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            onClick={() => onUpdateElement(selectedElementId, { x: 0, y: 0 })}
            className="min-h-11 text-xs bg-white/4 hover:bg-white/8 px-2.5 rounded-lg border border-white/6 transition-all font-bold text-white/50 hover:text-white/80 flex items-center gap-1"
          >
            <Move size={10} /> {t('createPost.storyComposer.center')}
          </button>
          <button
            type="button"
            onClick={() => onRemoveElement(selectedElementId)}
            className="min-h-11 min-w-11 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/15 transition-all"
            aria-label={t('createPost.storyComposer.delete')}
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => onSelectedElementIdChange(null)}
            className="min-h-11 min-w-11 flex items-center justify-center hover:bg-white/5 rounded-lg text-white/30 hover:text-white/60 transition-all"
            aria-label={t('createPost.storyComposer.close')}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Panel Tabs */}
      <div className="flex bg-white/3 p-0.5 rounded-lg border border-white/5">
        {[
          { id: 'style' as PanelTab, icon: Palette },
          { id: 'transform' as PanelTab, icon: Move },
          { id: 'layers' as PanelTab, icon: Layers },
        ].map(({ id, icon: Icon }) => (
          <button
            type="button"
            key={id}
            onClick={() => onPanelTabChange(id)}
            aria-pressed={panelTab === id}
            className={`flex-1 min-h-11 flex items-center justify-center gap-1 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
              panelTab === id
                ? 'bg-white/8 text-white'
                : 'text-white/25 hover:text-white/50'
            }`}
          >
            <Icon size={11} aria-hidden />{' '}
            {t(`createPost.storyComposer.panel_${id}`)}
          </button>
        ))}
      </div>

      {panelTab === 'style' && (
        <StoryElementStyleTab
          selectedElementId={selectedElementId}
          selectedElement={selectedElement}
          onUpdateElement={onUpdateElement}
        />
      )}

      {panelTab === 'transform' && (
        <StoryElementTransformTab
          selectedElementId={selectedElementId}
          selectedElement={selectedElement}
          onUpdateElement={onUpdateElement}
        />
      )}

      {panelTab === 'layers' && (
        <StoryElementLayersTab
          selectedElementId={selectedElementId}
          elements={elements}
          onSelectedElementIdChange={onSelectedElementIdChange}
          onMoveElementLayer={onMoveElementLayer}
          onDuplicateElement={onDuplicateElement}
          onRemoveElement={onRemoveElement}
        />
      )}
    </motion.div>
  );
}
