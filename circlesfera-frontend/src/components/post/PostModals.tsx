import { useTranslation } from 'react-i18next';
import ConfirmModal from '../modals/ConfirmModal';
import EditCaptionDialog from './EditCaptionDialog';

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

      <EditCaptionDialog
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        caption={editCaption}
        onCaptionChange={setEditCaption}
        onSubmit={onEdit}
        isSaving={isEditing}
      />
    </>
  );
}
