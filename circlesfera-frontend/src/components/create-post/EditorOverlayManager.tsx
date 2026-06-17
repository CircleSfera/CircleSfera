import type { MediaFile } from '../../hooks/useCreatePost';
import type { StoryElement } from '../../types';
import PhotoEditor from '../PhotoEditor';
import StoryComposer from '../story/StoryComposer';

interface EditorOverlayManagerProps {
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
  handleFilterSave: (
    file: File,
    filterString: string,
    cropData?: any,
    overlayDataUrl?: string,
    videoData?: any,
  ) => void;
  isProcessingEdit?: boolean;
}

export default function EditorOverlayManager({
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
  isProcessingEdit,
}: EditorOverlayManagerProps) {
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
    return (
      <div className="fixed inset-0 z-50 bg-black">
        {isProcessingEdit && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="text-white font-bold animate-pulse">
              Processing Media...
            </div>
          </div>
        )}
        <PhotoEditor
          image={mediaFiles[currentEditIndex].file}
          onSave={handleFilterSave}
          onCancel={() => setCurrentEditIndex(null)}
          onApplyToAll={(filterString) => {
            setMediaFiles(
              mediaFiles.map((m, idx) => {
                if (idx === currentEditIndex) return m;
                return { ...m, filter: filterString };
              }),
            );
            // Optionally we can show a toast here
            alert('Filtros aplicados a todos los archivos');
          }}
        />
      </div>
    );
  }

  return null;
}
