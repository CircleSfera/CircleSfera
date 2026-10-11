import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
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
});
