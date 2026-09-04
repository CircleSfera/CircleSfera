import { useTranslation } from 'react-i18next';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Textarea } from '../ui';
import { Dialog } from '../ui/Dialog';

interface PostModalsProps {
  showDeleteModal: boolean;
  setShowDeleteModal: (show: boolean) => void;
  onDelete: () => void;
  isDeleting: boolean;

  showEditModal: boolean;
  setShowEditModal: (show: boolean) => void;
  editCaption: string;
  setEditCaption: (caption: string) => void;
  onEdit: (e: React.FormEvent) => void;
  isEditing: boolean;
}

export default function PostModals({
  showDeleteModal,
  setShowDeleteModal,
  onDelete,
  isDeleting,
  showEditModal,
  setShowEditModal,
  editCaption,
  setEditCaption,
  onEdit,
  isEditing,
}: PostModalsProps) {
  const { t } = useTranslation();
  return (
    <>
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={onDelete}
        title={t('post.modals.delete_title')}
        message={t('post.modals.delete_warning')}
        confirmText={
          isDeleting ? t('post.modals.deleting') : t('post.modals.delete')
        }
        cancelText={t('post.modals.cancel')}
        isDestructive
        isLoading={isDeleting}
      />

      <Dialog
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('post.modals.edit_title')}
        maxWidth="md"
      >
        <form onSubmit={onEdit} className="flex flex-col gap-4">
          <Textarea
            value={editCaption}
            onChange={(e) => setEditCaption(e.target.value)}
            className="resize-none h-32"
            placeholder={t('post.modals.write_caption')}
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 min-h-11"
              onClick={() => setShowEditModal(false)}
              disabled={isEditing}
            >
              {t('post.modals.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1 min-h-11"
              isLoading={isEditing}
              disabled={isEditing}
            >
              {isEditing ? t('post.modals.saving') : t('post.modals.save')}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
