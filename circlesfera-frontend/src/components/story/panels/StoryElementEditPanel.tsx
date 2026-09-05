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
      className="px-4 pb-4 space-y-3"
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
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/45 truncate">
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
            className="min-h-9 min-w-9 flex items-center justify-center bg-white/4 hover:bg-white/8 text-white/50 hover:text-white/80 rounded-lg border border-white/6 transition-all"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={() => onMoveElementLayer(selectedElementId, 'up')}
            title={t('createPost.storyComposer.bring_forward')}
            className="min-h-9 min-w-9 flex items-center justify-center bg-white/4 hover:bg-white/8 text-white/50 hover:text-white/80 rounded-lg border border-white/6 transition-all"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => onMoveElementLayer(selectedElementId, 'down')}
            title={t('createPost.storyComposer.send_backward')}
            className="min-h-9 min-w-9 flex items-center justify-center bg-white/4 hover:bg-white/8 text-white/50 hover:text-white/80 rounded-lg border border-white/6 transition-all"
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            onClick={() => onUpdateElement(selectedElementId, { x: 0, y: 0 })}
            className="min-h-9 text-xs bg-white/4 hover:bg-white/8 px-2.5 rounded-lg border border-white/6 transition-all font-bold text-white/50 hover:text-white/80 flex items-center gap-1"
          >
            <Move size={10} /> {t('createPost.storyComposer.center')}
          </button>
          <button
            type="button"
            onClick={() => onRemoveElement(selectedElementId)}
            className="min-h-9 min-w-9 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/15 transition-all"
            aria-label={t('createPost.storyComposer.delete')}
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => onSelectedElementIdChange(null)}
            className="min-h-9 min-w-9 flex items-center justify-center hover:bg-white/5 rounded-lg text-white/30 hover:text-white/60 transition-all"
            aria-label={t('createPost.storyComposer.close')}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Panel Tabs */}
      <div className="flex bg-white/3 p-0.5 rounded-lg border border-white/5">
        {[
          { id: 'style' as PanelTab, label: 'Style', icon: Palette },
          { id: 'transform' as PanelTab, label: 'Transform', icon: Move },
          { id: 'layers' as PanelTab, label: 'Layers', icon: Layers },
        ].map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            onClick={() => onPanelTabChange(id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
              panelTab === id
                ? 'bg-white/8 text-white'
                : 'text-white/25 hover:text-white/50'
            }`}
          >
            <Icon size={11} /> {label}
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
