import type { PostShape } from '@circlesfera/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaFile, PostCanvasEdit } from '../../hooks/useCreatePostState';
import type { StoryElement } from '../../types';
import { exportEditedImage } from '../../utils/imageExport';
import BrandAmbientBackground from '../common/BrandAmbientBackground';
import StoryComposer from '../story/StoryComposer';
import type { StoryPhotoEdit } from '../story/storyPhoto';
import { CREATE_FULL_SCREEN } from './createStyles';

/** The name of the edited photo: the one it had, with its new type. */
function canvasFileName(name: string, type: string) {
  const stem = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${stem}.${type.split('/')[1] ?? 'png'}`;
}

export interface PostCanvasEditorProps {
  item: MediaFile;
  shape: PostShape;
  /** The edited photo, and what it was made from, to open it again. */
  onDone: (file: File, edit: PostCanvasEdit) => void;
  onCancel: () => void;
}

/**
 * A photo of a post on the full-screen canvas, in the post's shape: moved,
 * scaled, turned and filtered with the fingers, with text, emoji and drawing
 * on it. "Done" gives back the picture as it shows. It starts from the photo
 * with its earlier edits, or from where it was left on the canvas.
 */
export default function PostCanvasEditor({
  item,
  shape,
  onDone,
  onCancel,
}: PostCanvasEditorProps) {
  const { t } = useTranslation();
  const [base, setBase] = useState<File | null>(item.canvasEdit?.base ?? null);
  const elements = useRef<StoryElement[]>(item.canvasEdit?.elements ?? []);
  const photo = useRef<StoryPhotoEdit | undefined>(item.canvasEdit?.photo);

  useEffect(() => {
    if (base) return;
    let gone = false;
    const edited = Boolean(item.filter || item.cropData || item.overlayDataUrl);
    (edited
      ? exportEditedImage(
          item.file,
          item.filter ?? '',
          item.cropData,
          item.overlayDataUrl,
        )
      : Promise.resolve(item.file)
    ).then(
      (file) => !gone && setBase(file),
      () => !gone && setBase(item.file),
    );
    return () => {
      gone = true;
    };
  }, [base, item]);

  const onElementsChange = useCallback((next: StoryElement[]) => {
    elements.current = next;
  }, []);
  const onPhotoChange = useCallback((next: StoryPhotoEdit) => {
    photo.current = next;
  }, []);

  if (!base) {
    return (
      <div
        className={`${CREATE_FULL_SCREEN} flex items-center justify-center text-white font-medium`}
      >
        <BrandAmbientBackground placement="editor" />
        {t('createPost.edit.loading_media_editor')}
      </div>
    );
  }

  return (
    <StoryComposer
      frame={shape}
      initialMedia={base}
      bgStyle=""
      elements={elements.current}
      initialPhoto={photo.current}
      onElementsChange={onElementsChange}
      onPhotoChange={onPhotoChange}
      onClose={onCancel}
      onPost={(blob) =>
        onDone(
          new File([blob], canvasFileName(item.file.name, blob.type), {
            type: blob.type,
          }),
          { base, elements: elements.current, photo: photo.current },
        )
      }
    />
  );
}
