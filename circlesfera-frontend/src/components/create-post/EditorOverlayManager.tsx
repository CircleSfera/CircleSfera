import type { CreateMode, MediaFile } from '../../hooks/useCreatePost';
import type { StoryElement } from '../../types';
import PhotoEditor from '../PhotoEditor';
import StoryComposer from '../story/StoryComposer';

interface EditorOverlayManagerProps {
  mode: CreateMode;
  showStoryComposer: boolean;
  setShowStoryComposer: (val: boolean) => void;
  currentEditIndex: number | null;
  setCurrentEditIndex: (val: number | null) => void;
  mediaFiles: MediaFile[];
  setMediaFiles: (files: MediaFile[]) => void;
  setIsComposed: (val: boolean) => void;
  setStep: (step: 'edit' | 'caption') => void;
  originalStoryMedia: {
    file: File;
    url: string;
    type: 'image' | 'video';
  } | null;
  setOriginalStoryMedia: (
    media: { file: File; url: string; type: 'image' | 'video' } | null,
  ) => void;
  storyElements: StoryElement[];
  storyBgStyle: string;
  setStoryElements: (elements: StoryElement[]) => void;
  setStoryBgStyle: (style: string) => void;
  handleFilterSave: (img: File, filter: string) => void;
}

export default function EditorOverlayManager({
  mode,
  showStoryComposer,
  setShowStoryComposer,
  currentEditIndex,
  setCurrentEditIndex,
  mediaFiles,
  setMediaFiles,
  setIsComposed,
  setStep,
  originalStoryMedia,
  setOriginalStoryMedia,
  storyElements,
  storyBgStyle,
  setStoryElements,
  setStoryBgStyle,
  handleFilterSave,
}: EditorOverlayManagerProps) {
  const isStoryMode = mode === 'STORY';

  const handleComposerSave = async (blob: Blob) => {
    const file = new File([blob], 'story_composed.png', { type: 'image/png' });
    const url = URL.createObjectURL(file);
    setMediaFiles([{ file, url, type: 'image' }]);
    setIsComposed(true);
    setShowStoryComposer(false);
    setStep('edit');
  };

  if (showStoryComposer) {
    return (
      <StoryComposer
        initialMedia={originalStoryMedia?.file}
        onClose={() => {
          setShowStoryComposer(false);
          if (mediaFiles.length > 0) setIsComposed(true);
        }}
        onPost={handleComposerSave}
        elements={storyElements}
        bgStyle={storyBgStyle}
        onElementsChange={setStoryElements}
        onBgStyleChange={setStoryBgStyle}
        onBackgroundChange={(file) =>
          setOriginalStoryMedia({
            file,
            url: URL.createObjectURL(file),
            type: file.type.startsWith('video') ? 'video' : 'image',
          })
        }
      />
    );
  }

  if (currentEditIndex !== null) {
    if (isStoryMode) {
      setShowStoryComposer(true);
      setCurrentEditIndex(null);
      return null;
    }

    return (
      <div className="fixed inset-0 z-50 bg-black">
        <PhotoEditor
          image={mediaFiles[currentEditIndex].file}
          onSave={handleFilterSave}
          onCancel={() => setCurrentEditIndex(null)}
        />
      </div>
    );
  }

  return null;
}
