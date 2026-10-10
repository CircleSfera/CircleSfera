import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsePostInteractionsReturn } from '../../hooks/usePostInteractions';
import { api } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import type { Post } from '../../types';
import PostOverlays from './PostOverlays';

vi.mock('../../services', () => ({ api: { post: vi.fn() } }));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('framer-motion', async () =>
  (await import('../../test/still-motion')).stillMotion(),
);

/** A menu that offers exactly the actions it was given. */
vi.mock('./PostMenu', () => ({
  default: (
    props: Record<string, (() => void) | undefined | boolean | object>,
  ) => (
    <div role="menu">
      {[
        'onEdit',
        'onDelete',
        'onReport',
        'onPromote',
        'onAddToCollection',
        'onMute',
        'onHidePost',
        'onHideAuthor',
      ]
        .filter((name) => typeof props[name] === 'function')
        .map((name) => (
          <button key={name} type="button" onClick={props[name] as () => void}>
            {name}
          </button>
        ))}
    </div>
  ),
}));
vi.mock('./PostModals', () => ({
  default: (props: {
    showDeleteModal: boolean;
    showEditModal: boolean;
    onDelete: () => void;
    onEdit: () => void;
    isDeleting: boolean;
    isEditing: boolean;
  }) => (
    <div>
      {props.showDeleteModal && (
        <button
          type="button"
          onClick={props.onDelete}
          disabled={props.isDeleting}
        >
          confirm delete
        </button>
      )}
      {props.showEditModal && (
        <button type="button" onClick={props.onEdit} disabled={props.isEditing}>
          save caption
        </button>
      )}
    </div>
  ),
}));
const { dialog } = vi.hoisted(() => {
  const dialog =
    (name: string) =>
    (
      props: { isOpen?: boolean; onClose: () => void } & Record<
        string,
        unknown
      >,
    ) =>
      props.isOpen === false ? null : (
        <div role="dialog" aria-label={name}>
          <span>
            {name}:{' '}
            {JSON.stringify({
              targetType: props.targetType,
              targetId: props.targetId,
              postId: props.postId,
              receiverId: props.receiverId,
              receiverName: props.receiverName,
              username: props.username,
              currentCollectionId: props.currentCollectionId,
            })}
          </span>
          <button type="button" onClick={props.onClose}>
            close {name}
          </button>
          {typeof props.onToast === 'function' && (
            <>
              <button
                type="button"
                onClick={() =>
                  (props.onToast as (m: string, t: string) => void)(
                    'promoted',
                    'success',
                  )
                }
              >
                promote ok
              </button>
              <button
                type="button"
                onClick={() =>
                  (props.onToast as (m: string, t: string) => void)(
                    'not promoted',
                    'error',
                  )
                }
              >
                promote failed
              </button>
            </>
          )}
        </div>
      );
  return { dialog };
});
vi.mock('../modals/ReportModal', () => ({ default: dialog('report') }));
vi.mock('../modals/SharePostModal', () => ({ default: dialog('share') }));
vi.mock('../monetization/TipModal', () => ({ default: dialog('tip') }));
vi.mock('../modals/MuteDurationModal', () => ({ default: dialog('mute') }));
vi.mock('../modals/AddToCollectionModal', () => ({
  default: dialog('collection'),
}));
vi.mock('../creator/PromoteModal', () => ({ default: dialog('promote') }));

const post = (over: Partial<Post> = {}): Post =>
  ({
    id: 'post-1',
    profileId: 'profile-1',
    caption: 'Hello',
    profile: { id: 'profile-1', username: 'ana' },
    ...over,
  }) as Post;

function stub(over: Partial<UsePostInteractionsReturn> = {}) {
  const setters = {
    setShowMenu: vi.fn(),
    setShowDeleteModal: vi.fn(),
    setShowEditModal: vi.fn(),
    setShowReportModal: vi.fn(),
    setShowAddToCollectionModal: vi.fn(),
    setShowPromoteModal: vi.fn(),
    setShowShareModal: vi.fn(),
    setShowTipModal: vi.fn(),
    setShowMuteModal: vi.fn(),
    setEditCaption: vi.fn(),
  };
  return {
    menuRef: { current: null },
    isOwner: false,
    canPromote: false,
    showMenu: true,
    menuPosition: { top: 0, left: 0 },
    showDeleteModal: false,
    showEditModal: false,
    showReportModal: false,
    showAddToCollectionModal: false,
    showPromoteModal: false,
    showShareModal: false,
    showTipModal: false,
    showMuteModal: false,
    editCaption: '',
    deleteMutation: { mutate: vi.fn(), isPending: false },
    updateMutation: { mutate: vi.fn(), isPending: false },
    handleEdit: vi.fn(),
    handleMute: vi.fn(),
    collectionId: 'col-1',
    ...setters,
    ...over,
  } as unknown as UsePostInteractionsReturn & typeof setters;
}

function show(over: Partial<UsePostInteractionsReturn> = {}, thePost = post()) {
  const interactions = stub(over);
  const view = renderWithProviders(
    <PostOverlays post={thePost} interactions={interactions} />,
  );
  return { interactions, ...view };
}
const offered = () => screen.getAllByRole('button').map((b) => b.textContent);
const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('PostOverlays', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows no menu while it is closed', () => {
    show({ showMenu: false });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers a viewer to report, save, mute and hide, and nothing of the owner', () => {
    show();
    expect(offered()).toEqual([
      'onEdit',
      'onDelete',
      'onReport',
      'onAddToCollection',
      'onMute',
      'onHidePost',
      'onHideAuthor',
    ]);
  });

  it('offers the owner neither to mute nor to hide their own post, and to promote when that is possible', () => {
    const plain = show({ isOwner: true });
    expect(offered()).toEqual([
      'onEdit',
      'onDelete',
      'onReport',
      'onAddToCollection',
    ]);
    plain.unmount();

    show({ isOwner: true, canPromote: true });
    expect(offered()).toContain('onPromote');
  });

  it.each([
    ['onDelete', 'setShowDeleteModal'],
    ['onReport', 'setShowReportModal'],
    ['onAddToCollection', 'setShowAddToCollectionModal'],
  ] as const)('%s closes the menu and opens its dialog', (action, setter) => {
    const { interactions } = show();
    press(action);
    expect(interactions.setShowMenu).toHaveBeenCalledWith(false);
    expect(interactions[setter]).toHaveBeenCalledWith(true);
  });

  it('opens the caption for editing with what the post says now', () => {
    const first = show();
    press('onEdit');
    expect(first.interactions.setEditCaption).toHaveBeenCalledWith('Hello');
    expect(first.interactions.setShowEditModal).toHaveBeenCalledWith(true);
    first.unmount();

    const second = show({}, post({ caption: null as never }));
    press('onEdit');
    expect(second.interactions.setEditCaption).toHaveBeenCalledWith('');
  });

  it('opens the promotion from the menu', () => {
    const { interactions } = show({ isOwner: true, canPromote: true });
    press('onPromote');
    expect(interactions.setShowPromoteModal).toHaveBeenCalledWith(true);
  });

  it('mutes through the action it is given', () => {
    const { interactions } = show();
    press('onMute');
    expect(interactions.handleMute).toHaveBeenCalled();
  });

  describe('hiding', () => {
    it('says so when the post could not be hidden', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('down'));
      show();
      press('onHidePost');
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Could not hide post'),
      );
    });

    it('hides everything of the author and says so', async () => {
      vi.mocked(api.post).mockResolvedValue({} as never);
      const { interactions } = show();

      press('onHideAuthor');

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Author hidden from your feed',
        ),
      );
      expect(api.post).toHaveBeenCalledWith(
        '/feed/preferences/hide-author/profile-1',
      );
      expect(interactions.setShowMenu).toHaveBeenCalledWith(false);
    });

    it('finds the author on the profile of a post that carries no author id', async () => {
      vi.mocked(api.post).mockResolvedValue({} as never);
      show(
        {},
        post({
          profileId: undefined as never,
          profile: { id: 'profile-9', username: 'ben' } as never,
        }),
      );
      press('onHideAuthor');
      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          '/feed/preferences/hide-author/profile-9',
        ),
      );
    });

    it('asks the server nothing for a post with no author at all', () => {
      show({}, post({ profileId: undefined as never, profile: undefined }));
      press('onHideAuthor');
      expect(api.post).not.toHaveBeenCalled();
    });

    it('says so when the author could not be hidden', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('down'));
      show();
      press('onHideAuthor');
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Could not hide author'),
      );
    });
  });

  describe('its dialogs', () => {
    it('deletes and saves the caption through the actions it is given, and says when they are under way', () => {
      const { interactions } = show({
        showMenu: false,
        showDeleteModal: true,
        showEditModal: true,
      });
      press('confirm delete');
      press('save caption');
      expect(interactions.deleteMutation.mutate).toHaveBeenCalled();
      expect(interactions.handleEdit).toHaveBeenCalled();
    });

    it('holds the buttons while the post is being deleted or saved', () => {
      show({
        showMenu: false,
        showDeleteModal: true,
        showEditModal: true,
        deleteMutation: { mutate: vi.fn(), isPending: true } as never,
        updateMutation: { mutate: vi.fn(), isPending: true } as never,
      });
      expect(
        screen.getByRole('button', { name: 'confirm delete' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'save caption' }),
      ).toBeDisabled();
    });

    it.each([
      [
        'report',
        { showReportModal: true },
        'setShowReportModal',
        '"targetType":"POST","targetId":"post-1"',
      ],
      ['share', { showShareModal: true }, 'setShowShareModal', ''],
      [
        'tip',
        { showTipModal: true },
        'setShowTipModal',
        '"postId":"post-1","receiverId":"profile-1","receiverName":"ana"',
      ],
      ['mute', { showMuteModal: true }, 'setShowMuteModal', '"username":"ana"'],
      [
        'collection',
        { showAddToCollectionModal: true },
        'setShowAddToCollectionModal',
        '"postId":"post-1","currentCollectionId":"col-1"',
      ],
      ['promote', { showPromoteModal: true }, 'setShowPromoteModal', ''],
    ] as const)(
      'opens the %s dialog for this post and closes it',
      async (name, flags, setter, carries) => {
        const { interactions } = show({ showMenu: false, ...flags });

        const opened = await screen.findByRole('dialog', { name });
        expect(opened.textContent).toContain(carries);

        press(`close ${name}`);
        expect(interactions[setter]).toHaveBeenCalledWith(false);
      },
    );

    it('does not open the mute dialog for a post whose author has no name', () => {
      show(
        { showMenu: false, showMuteModal: true },
        post({ profile: undefined }),
      );
      expect(
        screen.queryByRole('dialog', { name: 'mute' }),
      ).not.toBeInTheDocument();
    });

    it('names a nameless receiver of a tip in the language of the person', () => {
      const english = show(
        { showMenu: false, showTipModal: true },
        post({ profile: undefined }),
      );
      expect(screen.getByRole('dialog', { name: 'tip' }).textContent).toContain(
        '"receiverName":"User"',
      );
      english.unmount();

      renderWithProviders(
        <PostOverlays
          post={post({ profile: undefined })}
          interactions={stub({ showMenu: false, showTipModal: true })}
        />,
        { lng: 'es' },
      );
      expect(screen.getByRole('dialog', { name: 'tip' }).textContent).toContain(
        '"receiverName":"Usuario"',
      );
    });

    it('shows what the promotion reports, as success or as failure', async () => {
      show({ showMenu: false, showPromoteModal: true });
      await screen.findByRole('dialog', { name: 'promote' });

      press('promote ok');
      press('promote failed');

      expect(toast.success).toHaveBeenCalledWith('promoted');
      expect(toast.error).toHaveBeenCalledWith('not promoted');
    });
  });
});
