import { AnimatePresence } from 'framer-motion';
import type { MouseEvent, RefObject } from 'react';
import type { StoryElement } from '../../../types';
import type { StoryCanvasRef } from '../Editor/StoryCanvas';
import type { StoryTemplate } from '../storyComposer.constants';
import type { PanelTab, StoryComposerTab } from '../storyComposer.types';
import StoryBackgroundPanel from './StoryBackgroundPanel';
import StoryDrawPanel from './StoryDrawPanel';
import StoryElementEditPanel from './StoryElementEditPanel';
import StoryPollPanel from './StoryPollPanel';
import StoryQnaPanel from './StoryQnaPanel';
import StoryStickersPanel from './StoryStickersPanel';
import StoryTemplatesPanel from './StoryTemplatesPanel';

export interface StoryDockContentProps {
  selectedElementId: string | null;
  selectedElement: StoryElement | undefined;
  activeTab: StoryComposerTab;
  panelTab: PanelTab;
  elements: StoryElement[];
  storyCanvasRef: RefObject<StoryCanvasRef | null>;
  brushWidth: number;
  brushColor: string;
  bgStyle: string;
  backgroundUrl: string | null;
  bgBlur: number;
  bgDarken: number;
  activeStickerCategory: number;
  pollQuestion: string;
  pollOption1: string;
  pollOption2: string;
  qnaPrompt: string;
  onPanelTabChange: (tab: PanelTab) => void;
  onDuplicateElement: (id: string) => void;
  onMoveElementLayer: (id: string, direction: 'up' | 'down') => void;
  onUpdateElement: (id: string, updates: Partial<StoryElement>) => void;
  onRemoveElement: (id: string) => void;
  onSelectedElementIdChange: (id: string | null) => void;
  onBrushWidthChange: (width: number) => void;
  onBrushColorChange: (color: string) => void;
  onUploadBackground: (e: MouseEvent<HTMLButtonElement>) => void;
  onSelectGradient: (grad: string) => void;
  onBgBlurChange: (blur: number) => void;
  onBgDarkenChange: (darken: number) => void;
  onActiveStickerCategoryChange: (index: number) => void;
  onAddSticker: (sticker: string) => void;
  onPollQuestionChange: (value: string) => void;
  onPollOption1Change: (value: string) => void;
  onPollOption2Change: (value: string) => void;
  onAddPoll: () => void;
  onQnaPromptChange: (value: string) => void;
  onAddQna: () => void;
  onApplyTemplate: (template: StoryTemplate) => void;
}

export default function StoryDockContent({
  selectedElementId,
  selectedElement,
  activeTab,
  panelTab,
  elements,
  storyCanvasRef,
  brushWidth,
  brushColor,
  bgStyle,
  backgroundUrl,
  bgBlur,
  bgDarken,
  activeStickerCategory,
  pollQuestion,
  pollOption1,
  pollOption2,
  qnaPrompt,
  onPanelTabChange,
  onDuplicateElement,
  onMoveElementLayer,
  onUpdateElement,
  onRemoveElement,
  onSelectedElementIdChange,
  onBrushWidthChange,
  onBrushColorChange,
  onUploadBackground,
  onSelectGradient,
  onBgBlurChange,
  onBgDarkenChange,
  onActiveStickerCategoryChange,
  onAddSticker,
  onPollQuestionChange,
  onPollOption1Change,
  onPollOption2Change,
  onAddPoll,
  onQnaPromptChange,
  onAddQna,
  onApplyTemplate,
}: StoryDockContentProps) {
  return (
    <AnimatePresence mode="wait">
      {selectedElementId &&
        selectedElement &&
        selectedElement.type !== 'text' && (
          <StoryElementEditPanel
            selectedElementId={selectedElementId}
            selectedElement={selectedElement}
            panelTab={panelTab}
            elements={elements}
            onPanelTabChange={onPanelTabChange}
            onDuplicateElement={onDuplicateElement}
            onMoveElementLayer={onMoveElementLayer}
            onUpdateElement={onUpdateElement}
            onRemoveElement={onRemoveElement}
            onSelectedElementIdChange={onSelectedElementIdChange}
          />
        )}

      {!selectedElementId && activeTab === 'draw' && (
        <StoryDrawPanel
          storyCanvasRef={storyCanvasRef}
          brushWidth={brushWidth}
          brushColor={brushColor}
          onBrushWidthChange={onBrushWidthChange}
          onBrushColorChange={onBrushColorChange}
        />
      )}

      {!selectedElementId && activeTab === 'background' && (
        <StoryBackgroundPanel
          bgStyle={bgStyle}
          backgroundUrl={backgroundUrl}
          bgBlur={bgBlur}
          bgDarken={bgDarken}
          onUploadBackground={onUploadBackground}
          onSelectGradient={onSelectGradient}
          onBgBlurChange={onBgBlurChange}
          onBgDarkenChange={onBgDarkenChange}
        />
      )}

      {!selectedElementId && activeTab === 'stickers' && (
        <StoryStickersPanel
          activeStickerCategory={activeStickerCategory}
          onActiveStickerCategoryChange={onActiveStickerCategoryChange}
          onAddSticker={onAddSticker}
        />
      )}

      {!selectedElementId && activeTab === 'poll' && (
        <StoryPollPanel
          pollQuestion={pollQuestion}
          pollOption1={pollOption1}
          pollOption2={pollOption2}
          onPollQuestionChange={onPollQuestionChange}
          onPollOption1Change={onPollOption1Change}
          onPollOption2Change={onPollOption2Change}
          onAddPoll={onAddPoll}
        />
      )}

      {!selectedElementId && activeTab === 'qna' && (
        <StoryQnaPanel
          qnaPrompt={qnaPrompt}
          onQnaPromptChange={onQnaPromptChange}
          onAddQna={onAddQna}
        />
      )}

      {!selectedElementId && activeTab === 'templates' && (
        <StoryTemplatesPanel onApplyTemplate={onApplyTemplate} />
      )}
    </AnimatePresence>
  );
}
