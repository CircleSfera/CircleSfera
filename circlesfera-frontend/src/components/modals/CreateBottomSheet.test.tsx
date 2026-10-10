import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { renderWithProviders } from '../../test/test-utils';
import CreateBottomSheet from './CreateBottomSheet';

function Where() {
  const location = useLocation();
  return (
    <output data-testid="where">{location.pathname + location.search}</output>
  );
}
const show = () =>
  renderWithProviders(
    <>
      <button
        type="button"
        onClick={() => useUIStore.getState().openCreateMenu()}
      >
        open create
      </button>
      <CreateBottomSheet />
      <Where />
    </>,
    { routerProps: { useTransitions: false, initialEntries: ['/home'] } },
  );
const open = () => act(() => useUIStore.getState().openCreateMenu());
const sheet = () => screen.getByRole('dialog', { name: 'Create' });
const item = (name: string | RegExp) =>
  within(sheet()).getByRole('button', { name });
const where = () => screen.getByTestId('where').textContent;
const closed = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

describe('CreateBottomSheet', () => {
  beforeEach(() => {
    useUIStore.setState({
      isCreateMenuOpen: false,
      isCreateHighlightOpen: false,
    });
    document.body.style.overflow = '';
  });

  it('shows nothing until it is opened', () => {
    show();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens as a dialog named Create, with everything that can be created', () => {
    show();
    open();

    expect(sheet()).toHaveAttribute('aria-modal', 'true');
    expect(
      within(sheet())
        .getAllByRole('button')
        .map((button) => button.textContent),
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
  ])('goes to where %s is made, and closes', async (name, path) => {
    show();
    open();

    fireEvent.click(item(name));

    expect(where()).toBe(path);
    expect(useUIStore.getState().isCreateMenuOpen).toBe(false);
    await closed();
  });

  it('opens the highlight maker instead of moving, and closes', async () => {
    show();
    open();

    fireEvent.click(item('Highlights'));

    expect(useUIStore.getState().isCreateHighlightOpen).toBe(true);
    expect(where()).toBe('/home');
    await closed();
  });

  it('closes when the page behind it is pressed', async () => {
    show();
    open();

    fireEvent.click(sheet().previousElementSibling as HTMLElement);

    await closed();
    expect(where()).toBe('/home');
  });

  it('closes with Escape, from inside it or from anywhere', async () => {
    show();
    open();
    fireEvent.keyDown(item('Post'), { key: 'Escape' });
    await closed();

    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    await closed();

    // Closed, the key does nothing.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUIStore.getState().isCreateMenuOpen).toBe(false);
  });

  it('takes the focus when it opens, keeps it inside, and gives it back to what opened it', async () => {
    show();
    const opener = screen.getByRole('button', { name: 'open create' });
    opener.focus();
    fireEvent.click(opener);

    await waitFor(() => expect(item('Post')).toHaveFocus());

    // Past the last one, the first; before the first, the last.
    item(/Studio/).focus();
    fireEvent.keyDown(item(/Studio/), { key: 'Tab' });
    expect(item('Post')).toHaveFocus();
    fireEvent.keyDown(item('Post'), { key: 'Tab', shiftKey: true });
    expect(item(/Studio/)).toHaveFocus();

    fireEvent.keyDown(item(/Studio/), { key: 'Escape' });
    await closed();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('holds the page behind it still while open, and lets it go after', async () => {
    const { unmount } = show();
    open();
    expect(document.body.style.overflow).toBe('hidden');

    act(() => useUIStore.getState().closeCreateMenu());
    await waitFor(() => expect(document.body.style.overflow).toBe('unset'));

    open();
    unmount();
    expect(document.body.style.overflow).toBe('unset');
  });
});
