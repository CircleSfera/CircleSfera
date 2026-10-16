import { AnimatePresence } from 'framer-motion';
import type { MouseEvent, RefObject } from 'react';
import type { StoryElement } from '../../../types';
import type { StoryCanvasRef } from '../Editor/StoryCanvas';
import {
  STORY_STICKER_MAX,
  type StoryTemplate,
} from '../storyComposer.constants';
import type { PanelTab, StoryComposerTab } from '../storyComposer.types';
import { isLiveElement } from '../storyInteractive';
import type { MusicTrack } from '../storyShare.types';
import StoryBackgroundPanel from './StoryBackgroundPanel';
import StoryCountdownPanel from './StoryCountdownPanel';
import StoryDrawPanel from './StoryDrawPanel';
import StoryElementEditPanel from './StoryElementEditPanel';
import StoryHashtagPanel from './StoryHashtagPanel';
import StoryLinkPanel from './StoryLinkPanel';
import StoryLocationPanel from './StoryLocationPanel';
import StoryMentionPanel from './StoryMentionPanel';
import StoryMusicPanel from './StoryMusicPanel';
import StoryPollPanel from './StoryPollPanel';
import StoryQnaPanel from './StoryQnaPanel';
import StoryQuizPanel from './StoryQuizPanel';
import StorySliderPanel from './StorySliderPanel';
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
  backgroundIsVideo: boolean;
  bgBlur: number;
  bgDarken: number;
  activeStickerCategory: number;
  pollQuestion: string;
  pollOptions: string[];
  qnaPrompt: string;
  onPanelTabChange: (tab: PanelTab) => void;
  onDuplicateElement: (id: string) => void;
  onMoveElementLayer: (id: string, direction: 'up' | 'down') => void;
  onUpdateElement: (id: string, updates: Partial<StoryElement>) => void;
  onCommitElements: () => void;
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
  onPollOptionsChange: (value: string[]) => void;
  onAddPoll: () => void;
  /** Adds a piece built by a setup panel (quiz, slider, hashtag). */
  onAddElement: (el: StoryElement) => void;
  /** Opens the setup of an interactive sticker from the tray. */
  onOpenTab: (tab: StoryComposerTab) => void;
  onQnaPromptChange: (value: string) => void;
  onAddQna: () => void;
  onApplyTemplate: (template: StoryTemplate) => void;
  /** The place of the story, when the editor shares it itself. */
  place?: { name: string | null; onOpen: () => void };
  /** The song of the story, when the editor shares it itself. */
  music?: { track: MusicTrack | null; onOpen: () => void };
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
  backgroundIsVideo,
  bgBlur,
  bgDarken,
  activeStickerCategory,
  pollQuestion,
  pollOptions,
  qnaPrompt,
  onPanelTabChange,
  onDuplicateElement,
  onMoveElementLayer,
  onUpdateElement,
  onCommitElements,
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
  onPollOptionsChange,
  onAddPoll,
  onAddElement,
  onOpenTab,
  onQnaPromptChange,
  onAddQna,
  onApplyTemplate,
  place,
  music,
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
            onCommitElements={onCommitElements}
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
          backgroundIsVideo={backgroundIsVideo}
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
          onOpenSticker={onOpenTab}
          canPlace={Boolean(place)}
          canMusic={Boolean(music)}
          full={elements.filter(isLiveElement).length >= STORY_STICKER_MAX}
        />
      )}

      {!selectedElementId && activeTab === 'poll' && (
        <StoryPollPanel
          pollQuestion={pollQuestion}
          pollOptions={pollOptions}
          onPollQuestionChange={onPollQuestionChange}
          onPollOptionsChange={onPollOptionsChange}
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

      {!selectedElementId && activeTab === 'quiz' && (
        <StoryQuizPanel onAdd={onAddElement} />
      )}

      {!selectedElementId && activeTab === 'slider' && (
        <StorySliderPanel onAdd={onAddElement} />
      )}

      {!selectedElementId && activeTab === 'countdown' && (
        <StoryCountdownPanel onAdd={onAddElement} />
      )}

      {!selectedElementId && activeTab === 'link' && (
        <StoryLinkPanel onAdd={onAddElement} />
      )}

      {!selectedElementId && activeTab === 'hashtag' && (
        <StoryHashtagPanel onAdd={onAddElement} />
      )}

      {!selectedElementId && activeTab === 'mention' && (
        <StoryMentionPanel onAdd={onAddElement} />
      )}

      {!selectedElementId && activeTab === 'location' && place && (
        <StoryLocationPanel
          placeName={place.name}
          onOpenPlace={place.onOpen}
          onStory={elements.some((el) => el.type === 'location')}
          onAdd={onAddElement}
        />
      )}

      {!selectedElementId && activeTab === 'music' && music && (
        <StoryMusicPanel
          track={music.track}
          onOpenMusic={music.onOpen}
          onStory={elements.some((el) => el.type === 'music')}
          onAdd={onAddElement}
        />
      )}

      {!selectedElementId && activeTab === 'templates' && (
        <StoryTemplatesPanel onApplyTemplate={onApplyTemplate} />
      )}
    </AnimatePresence>
  );
}
