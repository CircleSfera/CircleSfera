import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import PostMenu from './PostMenu';

vi.mock('framer-motion', async () =>
  (await import('../../test/still-motion')).stillMotion(),
);

type Props = ComponentProps<typeof PostMenu>;

function show(over: Partial<Props> = {}) {
  const props: Props = {
    showMenu: true,
    menuRef: { current: null },
    menuPosition: { top: 0, right: 0 },
    isOwner: true,
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onReport: vi.fn(),
    onAddToCollection: vi.fn(),
    ...over,
  };
  renderWithProviders(<PostMenu {...props} />);
  return props;
}

describe('PostMenu', () => {
  it('offers the author to turn comments and the like count off, and on again', () => {
    const onToggleComments = vi.fn();
    const onToggleLikes = vi.fn();
    show({ onToggleComments, onToggleLikes });
    fireEvent.click(screen.getByText('Turn off commenting'));
    fireEvent.click(screen.getByText('Hide like count'));
    expect(onToggleComments).toHaveBeenCalledTimes(1);
    expect(onToggleLikes).toHaveBeenCalledTimes(1);
    cleanup();

    show({
      onToggleComments,
      onToggleLikes,
      commentsOff: true,
      likesHidden: true,
    });
    expect(screen.getByText('Turn on commenting')).toBeInTheDocument();
    expect(screen.getByText('Show like count')).toBeInTheDocument();
  });

  it('offers the author the collaborator, and the collaborator a way to leave', () => {
    const onCollaborator = vi.fn();
    show({ onCollaborator, onLeaveCollaboration: vi.fn() });
    fireEvent.click(screen.getByText('Collaborator'));
    expect(onCollaborator).toHaveBeenCalledTimes(1);
    // Leaving is for the collaborator, never the author.
    expect(screen.queryByText('Stop collaborating')).not.toBeInTheDocument();
    cleanup();

    const onLeaveCollaboration = vi.fn();
    show({ isOwner: false, onCollaborator: vi.fn(), onLeaveCollaboration });
    expect(screen.queryByText('Collaborator')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Stop collaborating'));
    expect(onLeaveCollaboration).toHaveBeenCalledTimes(1);
  });

  it('offers no such switch to someone else', () => {
    show({ isOwner: false, onToggleComments: vi.fn(), onToggleLikes: vi.fn() });
    expect(screen.queryByText('Turn off commenting')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide like count')).not.toBeInTheDocument();
  });

  it('offers the author to pin the post to their profile, and to unpin it', () => {
    const onTogglePin = vi.fn();
    show({ onTogglePin });
    fireEvent.click(screen.getByText('Pin to your profile'));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    cleanup();

    show({ onTogglePin, pinned: true });
    expect(screen.getByText('Unpin from your profile')).toBeInTheDocument();
  });

  it('offers no pin to someone else', () => {
    show({ isOwner: false, onTogglePin: vi.fn() });
    expect(screen.queryByText('Pin to your profile')).not.toBeInTheDocument();
  });

  it('offers the author to archive their post', () => {
    const onArchive = vi.fn();
    show({ onArchive });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Show on profile' }),
    ).not.toBeInTheDocument();
  });

  it('offers to show an archived post on the profile again', () => {
    const onArchive = vi.fn();
    show({ onArchive, isArchived: true });

    fireEvent.click(screen.getByRole('button', { name: 'Show on profile' }));
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Archive' }),
    ).not.toBeInTheDocument();
  });

  it('offers no archive to someone else, nor when no action is given', () => {
    const first = show({ isOwner: false, onArchive: vi.fn() });
    expect(
      screen.queryByRole('button', { name: 'Archive' }),
    ).not.toBeInTheDocument();
    expect(first.onArchive).not.toHaveBeenCalled();
  });

  it('offers anyone to add the post to their story, when it can be shared', () => {
    const onAddToStory = vi.fn();
    show({ isOwner: false, onAddToStory });

    fireEvent.click(screen.getByRole('button', { name: 'Add to your story' }));
    expect(onAddToStory).toHaveBeenCalledTimes(1);
  });

  it('does not offer it for a post that cannot be shared', () => {
    show({ isOwner: true });

    expect(
      screen.queryByRole('button', { name: 'Add to your story' }),
    ).not.toBeInTheDocument();
  });

  it('offers someone else to see why the post is shown, and not its author', () => {
    const props = show({ isOwner: false, onWhy: vi.fn() });
    fireEvent.click(screen.getByText('Why am I seeing this?'));
    expect(props.onWhy).toHaveBeenCalledTimes(1);
  });

  it('offers no reason to the author of the post', () => {
    show({ isOwner: true, onWhy: vi.fn() });
    expect(screen.queryByText('Why am I seeing this?')).not.toBeInTheDocument();
  });

  it('opens as a sheet from the bottom on a phone, closed by the shade behind it', () => {
    const props = show({ isOwner: false });
    const sheet = screen.getByRole('dialog', { name: 'Options' });
    expect(sheet).toHaveTextContent('Report');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('opens as a menu by its button on a wide screen', () => {
    const wide = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    show({ isOwner: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Report')).toBeInTheDocument();
    wide.mockRestore();
  });
});
