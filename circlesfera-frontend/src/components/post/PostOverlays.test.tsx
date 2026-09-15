import { fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import type { Post } from '../../types';
import PostOverlays from './PostOverlays';

vi.mock('../../services', () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./PostMenu', () => ({
  default: ({ onHidePost }: { onHidePost?: () => void }) => (
    <button type="button" onClick={() => onHidePost?.()}>
      hide-post
    </button>
  ),
}));

vi.mock('./PostModals', () => ({ default: () => null }));
vi.mock('../modals/AddToCollectionModal', () => ({ default: () => null }));
vi.mock('../modals/MuteDurationModal', () => ({ default: () => null }));
vi.mock('../modals/ReportModal', () => ({ default: () => null }));
vi.mock('../modals/SharePostModal', () => ({ default: () => null }));
vi.mock('../monetization/TipModal', () => ({ default: () => null }));

const post = {
  id: 'post-1',
  profileId: 'profile-1',
  caption: 'hi',
} as Post;

function interactionsStub() {
  return {
    menuRef: { current: null },
    isOwner: false,
    canPromote: false,
    showMenu: true,
    setShowMenu: vi.fn(),
    menuPosition: { top: 0, left: 0 },
    showDeleteModal: false,
    setShowDeleteModal: vi.fn(),
    showEditModal: false,
    setShowEditModal: vi.fn(),
    showReportModal: false,
    setShowReportModal: vi.fn(),
    showAddToCollectionModal: false,
    setShowAddToCollectionModal: vi.fn(),
    showPromoteModal: false,
    setShowPromoteModal: vi.fn(),
    showShareModal: false,
    setShowShareModal: vi.fn(),
    showTipModal: false,
    setShowTipModal: vi.fn(),
    showMuteModal: false,
    setShowMuteModal: vi.fn(),
    editCaption: '',
    setEditCaption: vi.fn(),
    deleteMutation: { mutate: vi.fn(), isPending: false },
    updateMutation: { mutate: vi.fn(), isPending: false },
    handleEdit: vi.fn(),
    handleMute: vi.fn(),
    collectionId: null,
  };
}

describe('PostOverlays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({} as never);
  });

  it('toasts hide-post success from the catalog', async () => {
    const { i18n, getByRole } = renderWithProviders(
      <PostOverlays post={post} interactions={interactionsStub() as never} />,
    );

    fireEvent.click(getByRole('button', { name: 'hide-post' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        i18n!.t('feedPrefs.post_hidden'),
      );
    });
    expect(i18n!.t('feedPrefs.post_hidden')).toBe('Post hidden from your feed');
  });
});
