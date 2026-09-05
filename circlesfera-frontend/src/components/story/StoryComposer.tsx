import type { StoryElement } from '../../types';
import StoryComposerShellChrome from './StoryComposerShellChrome';
import StoryComposerStage from './StoryComposerStage';
import StoryComposerTextChrome from './StoryComposerTextChrome';
import { useStoryComposerState } from './useStoryComposerState';

interface StoryComposerProps {
  initialMedia?: File | null;
  onPost: (blob: Blob) => void;
  onClose: () => void;
  elements?: StoryElement[];
  bgStyle?: string;
  onElementsChange?: (elements: StoryElement[]) => void;
  onBgStyleChange?: (style: string) => void;
  onBackgroundChange?: (file: File) => void;
}

/** Immersive Story create path (ADR-0018). Layout shell only — state in hooks. */
export default function StoryComposer(props: StoryComposerProps) {
  const s = useStoryComposerState(props);

  return (
    <div className="fixed inset-0 z-50 bg-black font-sans">
      <StoryComposerStage
        stagePadClass={s.stagePadClass}
        cardSizeClass={s.cardSizeClass}
        textTakeoverActive={s.textTakeoverActive}
        textTakeover={s.textTakeover}
        containerRef={s.containerRef}
        storyCanvasRef={s.storyCanvasRef}
        bgStyle={s.bgStyle}
        backgroundUrl={s.backgroundUrl}
        background={s.background}
        bgBlur={s.bgBlur}
        bgDarken={s.bgDarken}
        brushColor={s.brushColor}
        brushWidth={s.brushWidth}
        activeTab={s.activeTab}
        elements={s.elements}
        selectedElementId={s.selectedElementId}
        draggingLayer={s.draggingLayer}
        showVGuide={s.showVGuide}
        showHGuide={s.showHGuide}
        textEditorRef={s.textEditorRef}
        textInput={s.textInput}
        textStyle={s.textStyle}
        textAlign={s.textAlign}
        textWidth={s.textWidth}
        takeoverPreviewCss={s.takeoverPreviewCss}
        setSelectedElementId={s.setSelectedElementId}
        setActiveTab={s.setActiveTab}
        updateElement={s.updateElement}
        setDraggingLayer={s.setDraggingLayer}
        setShowVGuide={s.setShowVGuide}
        setShowHGuide={s.setShowHGuide}
        openTextEdit={s.openTextEdit}
        setTextInput={s.setTextInput}
      />

      {!s.textTakeoverActive && (
        <StoryComposerShellChrome
          chromePointerArmed={s.chromePointerArmed}
          onClose={s.onClose}
          undo={s.undo}
          redo={s.redo}
          canUndo={s.canUndo}
          canRedo={s.canRedo}
          handlePost={s.handlePost}
          canPost={s.canPost}
          isExporting={s.isExporting}
          panelOpen={s.panelOpen}
          selectedElementId={s.selectedElementId}
          selectedElement={s.selectedElement}
          activeTab={s.activeTab}
          panelTab={s.panelTab}
          elements={s.elements}
          storyCanvasRef={s.storyCanvasRef}
          brushWidth={s.brushWidth}
          brushColor={s.brushColor}
          bgStyle={s.bgStyle}
          backgroundUrl={s.backgroundUrl}
          bgBlur={s.bgBlur}
          bgDarken={s.bgDarken}
          activeStickerCategory={s.activeStickerCategory}
          pollQuestion={s.pollQuestion}
          pollOption1={s.pollOption1}
          pollOption2={s.pollOption2}
          qnaPrompt={s.qnaPrompt}
          setPanelTab={s.setPanelTab}
          duplicateElement={s.duplicateElement}
          moveElementLayer={s.moveElementLayer}
          updateElement={s.updateElement}
          removeElement={s.removeElement}
          setSelectedElementId={s.setSelectedElementId}
          setBrushWidth={s.setBrushWidth}
          setBrushColor={s.setBrushColor}
          handleUploadBackground={s.handleUploadBackground}
          handleSelectGradient={s.handleSelectGradient}
          setBgBlur={s.setBgBlur}
          setBgDarken={s.setBgDarken}
          setActiveStickerCategory={s.setActiveStickerCategory}
          addSticker={s.addSticker}
          setPollQuestion={s.setPollQuestion}
          setPollOption1={s.setPollOption1}
          setPollOption2={s.setPollOption2}
          addPoll={s.addPoll}
          setQnaPrompt={s.setQnaPrompt}
          addQna={s.addQna}
          applyTemplate={s.applyTemplate}
          handleSelectTab={s.handleSelectTab}
        />
      )}

      {s.textTakeoverActive && s.textTakeover && (
        <StoryComposerTextChrome
          textTakeover={s.textTakeover}
          selectedElementId={s.selectedElementId}
          textInput={s.textInput}
          textColor={s.textColor}
          textStyle={s.textStyle}
          textAlign={s.textAlign}
          textFont={s.textFont}
          textFontSize={s.textFontSize}
          textLetterSpacing={s.textLetterSpacing}
          textWidth={s.textWidth}
          textGradientColors={s.textGradientColors}
          exitTextTakeover={s.exitTextTakeover}
          setTextColor={s.setTextColor}
          setTextGradientColors={s.setTextGradientColors}
          setTextStyle={s.setTextStyle}
          setTextAlign={s.setTextAlign}
          setTextFont={s.setTextFont}
          setTextFontSize={s.setTextFontSize}
          setTextLetterSpacing={s.setTextLetterSpacing}
          setTextWidth={s.setTextWidth}
          updateElement={s.updateElement}
        />
      )}

      <input
        ref={s.fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={s.handleFileChange}
      />
    </div>
  );
}
