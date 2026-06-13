import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-center mb-2">
              {t('post.modals.delete_title')}
            </h3>
            <p className="text-gray-400 text-center text-sm mb-6">
              {t('post.modals.delete_warning')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-medium transition-colors"
              >
                {t('post.modals.cancel')}
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {isDeleting
                  ? t('post.modals.deleting')
                  : t('post.modals.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Caption Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">
                {t('post.modals.edit_title')}
              </h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-1 hover:bg-zinc-700 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={onEdit}>
              <textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-32"
                placeholder={t('post.modals.write_caption')}
              />
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-medium transition-colors"
                >
                  {t('post.modals.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="flex-1 py-2.5 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {isEditing ? t('post.modals.saving') : t('post.modals.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
