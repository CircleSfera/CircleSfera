import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../../types';

export interface StoryElementLayersTabProps {
  selectedElementId: string;
  elements: StoryElement[];
  onSelectedElementIdChange: (id: string | null) => void;
  onMoveElementLayer: (id: string, direction: 'up' | 'down') => void;
  onDuplicateElement: (id: string) => void;
  onRemoveElement: (id: string) => void;
}

function layerPreview(el: StoryElement): {
  icon: string;
  labelKey?: string;
  label?: string;
} {
  if (el.type === 'text') {
    return { icon: '📝', label: el.content.slice(0, 30) || '…' };
  }
  if (el.type === 'poll') {
    return { icon: '📊', labelKey: 'tool_poll' };
  }
  if (el.type === 'qna') {
    return { icon: '❓', labelKey: 'tool_qna' };
  }
  return { icon: el.content, labelKey: 'tool_stickers' };
}

export default function StoryElementLayersTab({
  selectedElementId,
  elements,
  onSelectedElementIdChange,
  onMoveElementLayer,
  onDuplicateElement,
  onRemoveElement,
}: StoryElementLayersTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1.5 animate-slide-up max-h-[25vh] overflow-y-auto no-scrollbar">
      {[...elements].reverse().map((el) => {
        const preview = layerPreview(el);
        return (
          // biome-ignore lint/a11y/useSemanticElements: Layer item is not a button to avoid nested interactive elements
          <div
            key={el.id}
            className={`flex items-center gap-3 pl-3 pr-1 py-1 rounded-2xl transition-all group ${
              selectedElementId === el.id
                ? 'bg-white/8 border border-white/15'
                : 'hover:bg-white/4 border border-transparent'
            }`}
            onClick={() => onSelectedElementIdChange(el.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectedElementIdChange(el.id);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span className="text-lg leading-none shrink-0">
              {preview.icon}
            </span>
            <span className="flex-1 text-xs font-medium text-white/60 truncate">
              {preview.labelKey
                ? t(`createPost.storyComposer.${preview.labelKey}`)
                : preview.label}
            </span>
            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveElementLayer(el.id, 'up');
                }}
                aria-label={t('createPost.storyComposer.bring_forward')}
                className="min-w-11 min-h-11 flex items-center justify-center hover:bg-white/10 rounded-full text-white/30 hover:text-white/60 transition-all"
              >
                <ChevronUp size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveElementLayer(el.id, 'down');
                }}
                aria-label={t('createPost.storyComposer.send_backward')}
                className="min-w-11 min-h-11 flex items-center justify-center hover:bg-white/10 rounded-full text-white/30 hover:text-white/60 transition-all"
              >
                <ChevronDown size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicateElement(el.id);
                }}
                aria-label={t('createPost.storyComposer.duplicate')}
                className="min-w-11 min-h-11 flex items-center justify-center hover:bg-white/10 rounded-full text-white/30 hover:text-white/60 transition-all"
              >
                <Copy size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveElement(el.id);
                }}
                aria-label={t('createPost.storyComposer.delete')}
                className="min-w-11 min-h-11 flex items-center justify-center hover:bg-brand-secondary/20 rounded-full text-brand-secondary/60 hover:text-brand-secondary transition-all"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          </div>
        );
      })}
      {elements.length === 0 && (
        <p className="text-center text-xs text-white/15 py-6">
          {t('createPost.storyComposer.layers_empty')}
        </p>
      )}
    </div>
  );
}
