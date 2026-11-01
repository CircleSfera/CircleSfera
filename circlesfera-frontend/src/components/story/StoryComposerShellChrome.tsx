import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import { EditorHeaderAction } from '../create-post/EditorHeader';
import type { StoryCanvasRef } from './Editor/StoryCanvas';
import StoryDockContent from './panels/StoryDockContent';
import StoryPanelSheet from './StoryPanelSheet';
import StoryShareRow from './StoryShareRow';
import type { StoryTemplate } from './storyComposer.constants';
import {
  getStoryBottomBarClass,
  getStoryShareRowPadClass,
} from './storyComposer.layout';
import type {
  PanelTab,
  StoryBrush,
  StoryComposerTab,
} from './storyComposer.types';
import type { StoryAudience, StoryShareOptions } from './storyShare.types';

interface StoryComposerShellChromeProps {
  chromePointerArmed: boolean;
  /** While a piece is dragged the share row over the story steps aside. */
  hidden?: boolean;
  handlePost: (audience?: StoryAudience) => void;
  share?: StoryShareOptions;
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
  brush: StoryBrush;
  bgStyle: string;
  backgroundUrl: string | null;
  backgroundIsVideo: boolean;
  bgBlur: number;
  bgDarken: number;
  activeStickerCategory: number;
  pollQuestion: string;
  pollOptions: string[];
  qnaPrompt: string;
  setPanelTab: (t: PanelTab) => void;
  duplicateElement: (id: string) => void;
  moveElementLayer: (id: string, direction: 'up' | 'down') => void;
  updateElement: (id: string, updates: Partial<StoryElement>) => void;
  commitElements: () => void;
  removeElement: (id: string) => void;
  setSelectedElementId: (id: string | null) => void;
  setBrushWidth: (n: number) => void;
  setBrushColor: (c: string) => void;
  setBrush: (b: StoryBrush) => void;
  handleUploadBackground: (e?: {
    preventDefault?: () => void;
  }) => void | Promise<void>;
  handleSelectGradient: (g: string) => void;
  setBgBlur: (n: number) => void;
  setBgDarken: (n: number) => void;
  setActiveStickerCategory: (n: number) => void;
  addSticker: (s: string) => void;
  setPollQuestion: (v: string) => void;
  setPollOptions: (v: string[]) => void;
  addPoll: () => void;
  addElement: (el: StoryElement) => void;
  openTab: (tab: StoryComposerTab) => void;
  setQnaPrompt: (v: string) => void;
  addQna: () => void;
  applyTemplate: (t: StoryTemplate) => void;
}

/**
 * The bottom of the story editor: the open panel of a tool or of the selected
 * piece, if any, over the row that finishes the story, which is always there.
 * At rest on a phone the row floats over the bottom of the story; with a
 * panel open, and on desktop, it stands under the canvas. Hidden in text mode.
 */
export default function StoryComposerShellChrome(
  p: StoryComposerShellChromeProps,
) {
  const { t } = useTranslation();

  return (
    <div
      className={`z-40 flex flex-col items-center transition-opacity duration-150 ${getStoryBottomBarClass(
        p.panelOpen,
      )} ${p.hidden && !p.panelOpen ? 'opacity-0 pointer-events-none' : ''}`}
      aria-hidden={(p.hidden && !p.panelOpen) || undefined}
      data-testid="story-bottom-bar"
    >
      {p.panelOpen ? (
        <div className="flex w-full flex-col rounded-t-2xl md:rounded-3xl border-t md:border border-white/10 bg-surface-elevated md:max-w-md">
          <StoryPanelSheet open>
            <StoryDockContent
              selectedElementId={p.selectedElementId}
              selectedElement={p.selectedElement}
              activeTab={p.activeTab}
              panelTab={p.panelTab}
              elements={p.elements}
              storyCanvasRef={p.storyCanvasRef}
              brushWidth={p.brushWidth}
              brushColor={p.brushColor}
              brush={p.brush}
              bgStyle={p.bgStyle}
              backgroundUrl={p.backgroundUrl}
              backgroundIsVideo={p.backgroundIsVideo}
              bgBlur={p.bgBlur}
              bgDarken={p.bgDarken}
              activeStickerCategory={p.activeStickerCategory}
              pollQuestion={p.pollQuestion}
              pollOptions={p.pollOptions}
              qnaPrompt={p.qnaPrompt}
              onPanelTabChange={p.setPanelTab}
              onDuplicateElement={p.duplicateElement}
              onMoveElementLayer={p.moveElementLayer}
              onUpdateElement={p.updateElement}
              onCommitElements={p.commitElements}
              onRemoveElement={p.removeElement}
              onSelectedElementIdChange={p.setSelectedElementId}
              onBrushWidthChange={p.setBrushWidth}
              onBrushColorChange={p.setBrushColor}
              onBrushChange={p.setBrush}
              onUploadBackground={p.handleUploadBackground}
              onSelectGradient={p.handleSelectGradient}
              onBgBlurChange={p.setBgBlur}
              onBgDarkenChange={p.setBgDarken}
              onActiveStickerCategoryChange={p.setActiveStickerCategory}
              onAddSticker={p.addSticker}
              onPollQuestionChange={p.setPollQuestion}
              onPollOptionsChange={p.setPollOptions}
              onAddPoll={p.addPoll}
              onAddElement={p.addElement}
              onOpenTab={p.openTab}
              onQnaPromptChange={p.setQnaPrompt}
              onAddQna={p.addQna}
              onApplyTemplate={p.applyTemplate}
              place={
                p.share
                  ? {
                      name: p.share.placeStickerName,
                      onOpen: p.share.onOpenPlace,
                    }
                  : undefined
              }
              music={
                p.share
                  ? {
                      track: p.share.musicSticker ?? null,
                      onOpen: p.share.onOpenMusic,
                    }
                  : undefined
              }
            />
          </StoryPanelSheet>
        </div>
      ) : null}
      <div
        className={`w-full flex items-center justify-end gap-3 px-4 md:justify-center ${getStoryShareRowPadClass(
          p.panelOpen,
        )} ${p.chromePointerArmed ? '' : 'pointer-events-none'}`}
      >
        {p.share ? (
          <StoryShareRow
            share={p.share}
            canPost={p.canPost}
            isExporting={p.isExporting}
            onShare={p.handlePost}
          />
        ) : (
          <EditorHeaderAction
            label={t('createPost.storyComposer.post')}
            onClick={() => p.handlePost()}
            disabled={!p.canPost}
            isPending={p.isExporting}
            withCheck
          />
        )}
      </div>
    </div>
  );
}
