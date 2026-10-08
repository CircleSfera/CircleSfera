import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import EditorHeader, { EditorHeaderAction } from './create-post/EditorHeader';
import PhotoEditorPreview from './photo-editor/PhotoEditorPreview';
import PhotoEditorTabs from './photo-editor/PhotoEditorTabs';
import PhotoAdjustmentSelector from './photo-editor/panels/PhotoAdjustmentSelector';
import PhotoAdjustPanel from './photo-editor/panels/PhotoAdjustPanel';
import PhotoCropPanel from './photo-editor/panels/PhotoCropPanel';
import PhotoFiltersPanel from './photo-editor/panels/PhotoFiltersPanel';
import PhotoOverlayPanel from './photo-editor/panels/PhotoOverlayPanel';
import PhotoTrimPanel from './photo-editor/panels/PhotoTrimPanel';
import type {
  PhotoEditorSave,
  PhotoEditorTab,
} from './photo-editor/photoEditor.types';
import { usePhotoEditor } from './photo-editor/usePhotoEditor';

export type { CropData, VideoData } from './photo-editor/photoEditor.types';

interface PhotoEditorProps {
  image: File;
  onSave: PhotoEditorSave;
  onCancel: () => void;
  onStateChange?: (state: any) => void;
  initialState?: any;
  onApplyToAll?: (filterString: string) => void;
  /** Open on this tab (e.g. TRIM for Frame re-edit). */
  initialTab?: PhotoEditorTab;
  /** When set, video trim length is clamped to [min, max] seconds. */
  constrainDuration?: { min: number; max: number };
  /** The shape of the small previews: that of what is being created. */
  thumbnailRatio?: string;
}

/**
 * The photo and video editor of the composer: a preview, the panel of the
 * open tab and the tab rail. State lives in `usePhotoEditor`; each tab is a
 * panel under `photo-editor/panels`.
 */
export default function PhotoEditor({
  image,
  onSave,
  onCancel,
  onStateChange,
  initialState,
  onApplyToAll,
  initialTab,
  constrainDuration,
  thumbnailRatio,
}: PhotoEditorProps) {
  const { t } = useTranslation();
  const editor = usePhotoEditor({
    image,
    onSave,
    onStateChange,
    initialState,
    initialTab,
    constrainDuration,
    thumbnailRatio,
  });
  const { activeTab, isVideo } = editor;

  return (
    <div className="flex flex-col h-full bg-black md:bg-transparent text-white">
      <EditorHeader
        surface="overlay"
        leading="close"
        leadingLabel={t('createPost.edit.cancel')}
        onLeading={onCancel}
        title={t('createPost.edit.edit_media')}
        trailing={
          <>
            {onApplyToAll && (
              <EditorHeaderAction
                kind="plain"
                label={t('createPost.edit.apply_to_all')}
                onClick={() => onApplyToAll(editor.filterString)}
              />
            )}
            <EditorHeaderAction
              label={t('createPost.edit.done')}
              onClick={editor.handleSave}
              withCheck
            />
          </>
        }
      />

      <PhotoEditorPreview editor={editor} />

      {/* Controls: the panel of the open tab, then the tab rail. */}
      <div className="bg-surface-elevated/95 border-t border-white/8 flex flex-col shrink-0">
        <div className="min-h-0 flex flex-col justify-center py-2">
          <AnimatePresence mode="wait">
            {activeTab === 'FILTERS' ? (
              <PhotoFiltersPanel key="filters" editor={editor} />
            ) : activeTab === 'ADJUST' ? (
              <PhotoAdjustPanel key="adjust" editor={editor} />
            ) : activeTab === 'TRIM' && isVideo ? (
              <PhotoTrimPanel key="trim" editor={editor} />
            ) : activeTab === 'CROP' ? (
              <PhotoCropPanel key="crop" editor={editor} />
            ) : activeTab === 'OVERLAY' ? (
              <PhotoOverlayPanel key="overlay" editor={editor} />
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex flex-col border-t border-white/3">
          <AnimatePresence>
            {activeTab === 'ADJUST' && (
              <PhotoAdjustmentSelector editor={editor} />
            )}
          </AnimatePresence>

          <PhotoEditorTabs editor={editor} />
        </div>
      </div>
    </div>
  );
}
