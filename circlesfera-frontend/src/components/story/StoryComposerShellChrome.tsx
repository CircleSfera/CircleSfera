import type { RefObject } from 'react';
import type { StoryElement } from '../../types';
import type { StoryCanvasRef } from './Editor/StoryCanvas';
import StoryDockContent from './panels/StoryDockContent';
import StoryComposerChrome from './StoryComposerChrome';
import StoryPanelSheet from './StoryPanelSheet';
import StoryToolRail from './StoryToolRail';
import type { StoryTemplate } from './storyComposer.constants';
import type { PanelTab, StoryComposerTab } from './storyComposer.types';

interface StoryComposerShellChromeProps {
  chromePointerArmed: boolean;
  onClose: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handlePost: () => void;
  canPost: boolean;
  isExporting: boolean;
  panelOpen: boolean;
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
  setPanelTab: (t: PanelTab) => void;
  duplicateElement: (id: string) => void;
  moveElementLayer: (id: string, direction: 'up' | 'down') => void;
  updateElement: (id: string, updates: Partial<StoryElement>) => void;
  removeElement: (id: string) => void;
  setSelectedElementId: (id: string | null) => void;
  setBrushWidth: (n: number) => void;
  setBrushColor: (c: string) => void;
  handleUploadBackground: (e?: {
    preventDefault?: () => void;
  }) => void | Promise<void>;
  handleSelectGradient: (g: string) => void;
  setBgBlur: (n: number) => void;
  setBgDarken: (n: number) => void;
  setActiveStickerCategory: (n: number) => void;
  addSticker: (s: string) => void;
  setPollQuestion: (v: string) => void;
  setPollOption1: (v: string) => void;
  setPollOption2: (v: string) => void;
  addPoll: () => void;
  setQnaPrompt: (v: string) => void;
  addQna: () => void;
  applyTemplate: (t: StoryTemplate) => void;
  handleSelectTab: (tab: StoryComposerTab) => void;
}

/** Idle header + bottom dock (hidden during text takeover). */
export default function StoryComposerShellChrome(
  p: StoryComposerShellChromeProps,
) {
  return (
    <>
      <div
        className={`absolute top-0 left-0 right-0 z-40 bg-linear-to-b from-black/70 via-black/35 to-transparent ${
          p.chromePointerArmed ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <StoryComposerChrome
          onClose={p.onClose}
          onUndo={p.undo}
          onRedo={p.redo}
          canUndo={p.canUndo}
          canRedo={p.canRedo}
          onPost={p.handlePost}
          canPost={p.canPost}
          isExporting={p.isExporting}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none">
        <div className="pointer-events-auto flex flex-col rounded-t-2xl border-t border-white/10 bg-zinc-950/92 backdrop-blur-2xl shadow-[0_-12px_40px_rgba(0,0,0,0.45)] safe-area-bottom">
          <StoryPanelSheet open={p.panelOpen}>
            <StoryDockContent
              selectedElementId={p.selectedElementId}
              selectedElement={p.selectedElement}
              activeTab={p.activeTab}
              panelTab={p.panelTab}
              elements={p.elements}
              storyCanvasRef={p.storyCanvasRef}
              brushWidth={p.brushWidth}
              brushColor={p.brushColor}
              bgStyle={p.bgStyle}
              backgroundUrl={p.backgroundUrl}
              bgBlur={p.bgBlur}
              bgDarken={p.bgDarken}
              activeStickerCategory={p.activeStickerCategory}
              pollQuestion={p.pollQuestion}
              pollOption1={p.pollOption1}
              pollOption2={p.pollOption2}
              qnaPrompt={p.qnaPrompt}
              onPanelTabChange={p.setPanelTab}
              onDuplicateElement={p.duplicateElement}
              onMoveElementLayer={p.moveElementLayer}
              onUpdateElement={p.updateElement}
              onRemoveElement={p.removeElement}
              onSelectedElementIdChange={p.setSelectedElementId}
              onBrushWidthChange={p.setBrushWidth}
              onBrushColorChange={p.setBrushColor}
              onUploadBackground={p.handleUploadBackground}
              onSelectGradient={p.handleSelectGradient}
              onBgBlurChange={p.setBgBlur}
              onBgDarkenChange={p.setBgDarken}
              onActiveStickerCategoryChange={p.setActiveStickerCategory}
              onAddSticker={p.addSticker}
              onPollQuestionChange={p.setPollQuestion}
              onPollOption1Change={p.setPollOption1}
              onPollOption2Change={p.setPollOption2}
              onAddPoll={p.addPoll}
              onQnaPromptChange={p.setQnaPrompt}
              onAddQna={p.addQna}
              onApplyTemplate={p.applyTemplate}
            />
          </StoryPanelSheet>

          {!p.selectedElementId && (
            <StoryToolRail
              activeTab={p.activeTab}
              onSelectTab={p.handleSelectTab}
            />
          )}
        </div>
      </div>
    </>
  );
}
