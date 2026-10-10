import { fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import FrameOptionsSheet from './FrameOptionsSheet';

vi.mock('framer-motion', async () =>
  (await import('../../test/still-motion')).stillMotion(),
);

type Props = ComponentProps<typeof FrameOptionsSheet>;
const order: string[] = [];

function show(over: Partial<Props> = {}) {
  order.length = 0;
  const step = (name: string) => vi.fn(() => order.push(name));
  const props: Props = {
    isOpen: true,
    isOwner: false,
    onClose: step('close'),
    onEdit: step('edit'),
    onDelete: step('delete'),
    onReport: step('report'),
    onSave: step('save'),
    ...over,
  };
  return { props, ...renderWithProviders(<FrameOptionsSheet {...props} />) };
}
/** The options offered, without the buttons that only close the sheet. */
const options = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.textContent)
    .filter(Boolean);

describe('FrameOptionsSheet', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('is not there while closed', () => {
    const { container } = show({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a viewer to report and to save', () => {
    show();
    expect(screen.getByText('Options')).toBeInTheDocument();
    expect(options()).toEqual(['Report', 'Save']);
  });

  it('offers the owner to edit, delete and save, and to promote when that is possible', () => {
    const plain = show({ isOwner: true });
    expect(options()).toEqual(['Edit', 'Delete', 'Save']);
    plain.unmount();

    show({ isOwner: true, onPromote: vi.fn() });
    expect(options()).toEqual(['Promote Post', 'Edit', 'Delete', 'Save']);
  });

  it.each([
    ['Report', 'report', false],
    ['Save', 'save', false],
    ['Edit', 'edit', true],
    ['Delete', 'delete', true],
  ])('closes first and then does "%s"', (label, action, isOwner) => {
    show({ isOwner });
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(order).toEqual(['close', action]);
  });

  it('closes first and then opens the promotion', () => {
    const onPromote = vi.fn(() => order.push('promote'));
    show({ isOwner: true, onPromote });
    fireEvent.click(screen.getByRole('button', { name: 'Promote Post' }));
    expect(order).toEqual(['close', 'promote']);
  });

  it('closes from its close button and from the backdrop, without doing anything else', () => {
    const { props } = show();
    const closers = screen.getAllByRole('button', { name: 'Close' });
    expect(closers).toHaveLength(2);

    for (const closer of closers) fireEvent.click(closer);

    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['close', 'close']);
  });

  describe('as a sheet over the page', () => {
    it('holds the page still while open and lets it go when closed', () => {
      const { rerender, props, unmount } = show({ presentation: 'default' });
      expect(document.body.style.overflow).toBe('hidden');

      rerender(<FrameOptionsSheet {...props} isOpen={false} />);
      expect(document.body.style.overflow).toBe('unset');

      rerender(<FrameOptionsSheet {...props} isOpen />);
      unmount();
      expect(document.body.style.overflow).toBe('unset');
    });

    it('offers the same options, with a named close button and a backdrop that closes', () => {
      const { props, container } = show({
        presentation: 'default',
        isOwner: true,
      });
      expect(options()).toEqual(['Edit', 'Delete', 'Save']);

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      fireEvent.click(
        container.querySelector('.fixed.inset-0.bg-black\\/60') as HTMLElement,
      );
      expect(props.onClose).toHaveBeenCalledTimes(2);
    });
  });

  it('leaves the page alone when it opens inside a frame', () => {
    show();
    expect(document.body.style.overflow).toBe('');
  });
});
