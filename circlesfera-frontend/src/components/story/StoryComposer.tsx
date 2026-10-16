import type { StoryElement } from '../../types';
import BrandAmbientBackground from '../common/BrandAmbientBackground';
import { CREATE_FULL_SCREEN } from '../create-post/createStyles';
import StoryComposerChrome from './StoryComposerChrome';
import StoryComposerShellChrome from './StoryComposerShellChrome';
import StoryComposerStage from './StoryComposerStage';
import StoryComposerTextChrome from './StoryComposerTextChrome';
import type { StoryCanvasSize } from './storyComposer.export';
import type { StoryAudience, StoryShareOptions } from './storyShare.types';
import { useStoryComposerState } from './useStoryComposerState';

interface StoryComposerProps {
  initialMedia?: File | null;
  onPost: (
    blob: Blob,
    canvas: StoryCanvasSize,
    audience?: StoryAudience,
    video?: File | null,
  ) => void;
  /** Share from the editor; without it the editor ends with "Listo". */
  share?: StoryShareOptions;
  onClose: () => void;
  elements?: StoryElement[];
  bgStyle?: string;
  onElementsChange?: (elements: StoryElement[]) => void;
  onBgStyleChange?: (style: string) => void;
  onBackgroundChange?: (file: File) => void;
}

/** Immersive Story create path. Layout shell only — state in hooks. */
export default function StoryComposer(props: StoryComposerProps) {
  const s = useStoryComposerState(props);

  return (
    <div
      className={`${CREATE_FULL_SCREEN} font-sans flex flex-col md:justify-center`}
    >
      <BrandAmbientBackground placement="editor" />
      <StoryComposerStage
        stagePadClass={s.stagePadClass}
        stageFitClass={s.stageFitClass}
        cardSizeClass={s.cardSizeClass}
        panelOpen={s.panelOpen}
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
        commitElements={s.commitElements}
        removeElement={s.removeElement}
        setDraggingLayer={s.setDraggingLayer}
        setShowVGuide={s.setShowVGuide}
        setShowHGuide={s.setShowHGuide}
        openTextEdit={s.openTextEdit}
        setTextInput={s.setTextInput}
        overlay={
          s.textTakeoverActive ? null : (
            <StoryComposerChrome
              onClose={s.onClose}
              onUndo={s.undo}
              onRedo={s.redo}
              canUndo={s.canUndo}
              canRedo={s.canRedo}
              activeTab={s.activeTab}
              onSelectTab={s.handleSelectTab}
              hidden={s.draggingLayer}
              pointerArmed={s.chromePointerArmed}
              share={props.share}
              placeOnStory={s.elements.some((el) => el.type === 'location')}
            />
          )
        }
      />

      {!s.textTakeoverActive && (
        <StoryComposerShellChrome
          chromePointerArmed={s.chromePointerArmed}
          handlePost={s.handlePost}
          share={props.share}
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
          backgroundIsVideo={s.backgroundIsVideo}
          bgBlur={s.bgBlur}
          bgDarken={s.bgDarken}
          activeStickerCategory={s.activeStickerCategory}
          pollQuestion={s.pollQuestion}
          pollOptions={s.pollOptions}
          qnaPrompt={s.qnaPrompt}
          setPanelTab={s.setPanelTab}
          duplicateElement={s.duplicateElement}
          moveElementLayer={s.moveElementLayer}
          updateElement={s.updateElement}
          commitElements={s.commitElements}
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
          setPollOptions={s.setPollOptions}
          addPoll={s.addPoll}
          addElement={s.addElement}
          openTab={s.handleSelectTab}
          setQnaPrompt={s.setQnaPrompt}
          addQna={s.addQna}
          applyTemplate={s.applyTemplate}
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
