import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { Dialog } from '../ui/Dialog';
import { AdminListRow } from './AdminList';
import { AdminSplitView } from './AdminSplitView';

const show = (props: Partial<Parameters<typeof AdminSplitView>[0]> = {}) =>
  renderWithProviders(
    <AdminSplitView
      hasSelection={false}
      listAriaLabel="People"
      list={<p>the rows</p>}
      detail={<p>the record</p>}
      {...props}
    />,
  );

describe('AdminSplitView', () => {
  it('gives the list the whole width while no row is chosen', () => {
    show();

    const list = screen.getByRole('region', { name: 'People' });
    expect(list).toHaveClass('lg:flex-1');
    expect(list).not.toHaveClass('lg:shrink-0');
    expect(screen.queryByText('the record')).not.toBeInTheDocument();
    // No pane is drawn around the cards of the list.
    expect(list.parentElement).toHaveClass('lg:border-0!');
    expect(list.parentElement).not.toHaveClass('lg:h-[calc(100vh-13rem)]');
  });

  it('opens the record beside a narrow list once a row is chosen', () => {
    show({ hasSelection: true });

    const list = screen.getByRole('region', { name: 'People' });
    expect(list).toHaveClass('lg:shrink-0');
    expect(list.parentElement).not.toHaveClass('lg:border-0!');
    expect(screen.getByText('the record')).toBeInTheDocument();
  });

  it('keeps two columns when the caller has something for the side', () => {
    show({ emptyDetail: <p>start here</p> });

    expect(screen.getByRole('region', { name: 'People' })).toHaveClass(
      'lg:shrink-0',
    );
    expect(screen.getByText('start here')).toBeInTheDocument();
  });

  it('shows a heading over the list only when one is given', () => {
    const { unmount } = show();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    unmount();

    show({ listTitle: 'Requests (3)' });
    expect(
      screen.getByRole('heading', { name: 'Requests (3)' }),
    ).toBeInTheDocument();
  });
  describe('Escape with a record open', () => {
    const rowWithMenu = (
      <AdminListRow
        title="Ana"
        onClick={() => {}}
        badge={<input type="checkbox" aria-label="Choose Ana" />}
        primaryAction={<button type="button">Review</button>}
        secondaryActions={[{ label: 'Warn', onClick: () => {} }]}
      />
    );

    it('closes the record from any control of the row', () => {
      const onClearSelection = vi.fn();
      show({ hasSelection: true, onClearSelection, list: rowWithMenu });

      for (const control of [
        screen.getByRole('button', { name: 'Ana' }),
        screen.getByRole('checkbox', { name: 'Choose Ana' }),
        screen.getByRole('button', { name: 'Review' }),
        screen.getByRole('button', { name: 'More actions' }),
      ]) {
        fireEvent.keyDown(control, { key: 'Escape' });
      }

      expect(onClearSelection).toHaveBeenCalledTimes(4);
    });

    it('closes the open menu of a row first and the record with the next press', () => {
      const onClearSelection = vi.fn();
      show({ hasSelection: true, onClearSelection, list: rowWithMenu });
      const more = screen.getByRole('button', { name: 'More actions' });

      fireEvent.click(more);
      fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Warn' }), {
        key: 'Escape',
      });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(more).toHaveFocus();
      expect(onClearSelection).not.toHaveBeenCalled();

      fireEvent.keyDown(more, { key: 'Escape' });
      expect(onClearSelection).toHaveBeenCalledTimes(1);
    });

    it('leaves the menu of a row open while a dialog is on top of it', () => {
      const onClose = vi.fn();
      show({
        hasSelection: true,
        list: rowWithMenu,
        detail: (
          <Dialog isOpen onClose={onClose} title="Ban Ana">
            <button type="button">Confirm</button>
          </Dialog>
        ),
      });
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('leaves the record open while a dialog is on top of it', () => {
      const onClearSelection = vi.fn();
      const onClose = vi.fn();
      show({
        hasSelection: true,
        onClearSelection,
        detail: (
          <Dialog isOpen onClose={onClose} title="Ban Ana">
            <button type="button">Confirm</button>
          </Dialog>
        ),
      });

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
      expect(onClearSelection).not.toHaveBeenCalled();
    });
  });
});
