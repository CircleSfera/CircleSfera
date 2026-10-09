import { useTranslation } from 'react-i18next';
import { Button, Textarea } from '../ui';
import { Dialog } from '../ui/Dialog';

/** The longest caption the composer accepts. */
export const CAPTION_MAX_LENGTH = 2200;

interface EditCaptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  caption: string;
  onCaptionChange: (caption: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSaving: boolean;
  // What else can be changed with the caption (the cover of a frame).
  children?: React.ReactNode;
}

/** Changes the caption of a published post or frame; the media stays. */
export default function EditCaptionDialog({
  isOpen,
  onClose,
  caption,
  onCaptionChange,
  onSubmit,
  isSaving,
  children,
}: EditCaptionDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('post.modals.edit_title')}
      maxWidth="md"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          className="resize-none h-32"
          placeholder={t('post.modals.write_caption')}
          maxLength={CAPTION_MAX_LENGTH}
        />
        {children}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 min-h-11"
            onClick={onClose}
            disabled={isSaving}
          >
            {t('post.modals.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1 min-h-11"
            isLoading={isSaving}
            disabled={isSaving}
          >
            {isSaving ? t('post.modals.saving') : t('post.modals.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
