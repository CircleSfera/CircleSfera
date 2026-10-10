import { act, fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { renderWithProviders } from '../../test/test-utils';
import CreateBottomSheet from './CreateBottomSheet';

const drag = vi.hoisted(() => ({
  onDragEnd: null as null | ((e: unknown, info: unknown) => void),
}));

vi.mock('framer-motion', async () => {
  const still = (await import('../../test/still-motion')).stillMotion();
  const { createElement } = await import('react');
  return {
    ...still,
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) => (props: Record<string, unknown>) => {
          if (typeof props.onDragEnd === 'function') {
            drag.onDragEnd = props.onDragEnd as typeof drag.onDragEnd;
          }
          const Still = (
            still.motion as Record<
              string,
              (p: Record<string, unknown>) => unknown
            >
          )[tag];
          return createElement(Still as never, props);
        },
      },
    ),
  };
});

let where = '';
function Where() {
  const location = useLocation();
  where = location.pathname + location.search;
  return null;
}

function show(open = true) {
  useUIStore.setState({ isCreateMenuOpen: open, isCreateHighlightOpen: false });
  return renderWithProviders(
    <>
      <Where />
      <CreateBottomSheet />
    </>,
    { routerProps: { initialEntries: ['/'], useTransitions: false } },
  );
}
const ui = () => useUIStore.getState();
const sheet = () => screen.getByRole('dialog', { name: 'Create' });

describe('CreateBottomSheet', () => {
  beforeEach(() => {
    where = '';
    drag.onDragEnd = null;
    document.body.style.overflow = '';
  });

  it('is not there while the menu is closed', () => {
    show(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers what can be created, in two groups', () => {
    show();
    expect(within(sheet()).getByText('Content')).toBeInTheDocument();
    expect(within(sheet()).getByText('More')).toBeInTheDocument();
    expect(
      within(sheet())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Post',
      'Frame',
      'Story',
      'Circle',
      'Live',
      'Highlights',
      'StudioNew',
    ]);
  });

  it.each([
    ['Post', '/create?mode=post'],
    ['Frame', '/create?mode=frame'],
    ['Story', '/create?mode=story'],
    ['Circle', '/create?mode=circle'],
    ['Live', '/live/broadcast'],
    [/Studio/, '/edits'],
  ])('closes and goes to the screen of %s', (name, path) => {
    show();

    fireEvent.click(within(sheet()).getByRole('button', { name }));

    expect(where).toBe(path);
    expect(ui().isCreateMenuOpen).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes and opens the highlight dialog, without leaving the screen', () => {
    show();

    fireEvent.click(
      within(sheet()).getByRole('button', { name: 'Highlights' }),
    );

    expect(ui()).toMatchObject({
      isCreateMenuOpen: false,
      isCreateHighlightOpen: true,
    });
    expect(where).toBe('/');
  });

  it('closes with Escape and from the backdrop', () => {
    const { container } = show();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ui().isCreateMenuOpen).toBe(false);

    act(() => ui().openCreateMenu());
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(ui().isCreateMenuOpen).toBe(true);

    fireEvent.click(
      container.querySelector('.fixed.inset-0.bg-black\\/60') as HTMLElement,
    );
    expect(ui().isCreateMenuOpen).toBe(false);
  });

  it('ignores Escape while it is closed', () => {
    show(false);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ui().isCreateMenuOpen).toBe(false);
  });

  it.each([
    ['dragged far down', { offset: { y: 140 }, velocity: { y: 0 } }, false],
    ['flicked down', { offset: { y: 20 }, velocity: { y: 800 } }, false],
    ['moved a little', { offset: { y: 40 }, velocity: { y: 100 } }, true],
  ])('when %s, it stays open: %s', (_how, info, staysOpen) => {
    show();
    act(() => drag.onDragEnd?.({}, info));
    expect(ui().isCreateMenuOpen).toBe(staysOpen);
  });

  it('holds the page still while open and lets it go when closed or gone', () => {
    const { unmount } = show();
    expect(document.body.style.overflow).toBe('hidden');

    act(() => ui().closeCreateMenu());
    expect(document.body.style.overflow).toBe('unset');

    act(() => ui().openCreateMenu());
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('unset');
  });
});
