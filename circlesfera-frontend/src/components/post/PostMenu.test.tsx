import { fireEvent, screen } from '@testing-library/react';
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
});
