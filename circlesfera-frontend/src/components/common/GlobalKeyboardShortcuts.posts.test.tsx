import { fireEvent } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { GlobalKeyboardShortcuts } from './GlobalKeyboardShortcuts';

let where = '';
function Where() {
  where = useLocation().pathname;
  return null;
}

/** Three posts one under another; the viewport is 800 px high. */
function feed(tops: number[], path = '/') {
  const view = renderWithProviders(
    <>
      <Where />
      <GlobalKeyboardShortcuts />
      {tops.map((top, index) => (
        <article key={top} data-post-card="true" data-top={top}>
          <button type="button" data-testid="like-button" data-index={index} />
        </article>
      ))}
      <input data-testid="comment" />
    </>,
    { routerProps: { initialEntries: [path], useTransitions: false } },
  );
  for (const post of view.container.querySelectorAll<HTMLElement>(
    '[data-post-card]',
  )) {
    const top = Number(post.dataset.top);
    post.getBoundingClientRect = () => ({ top, height: 400 }) as DOMRect;
  }
  return view;
}
const press = (key: string, target: Window | Element = window) =>
  fireEvent.keyDown(target, { key });

describe('GlobalKeyboardShortcuts on a feed', () => {
  const scrollTo = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('scrollTo', scrollTo);
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 1000,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  // The post nearest the middle of the screen (400 px) is the one at 200.
  it('goes to the next post with J, leaving room for the top bar', () => {
    feed([-300, 200, 700]);
    press('j');
    expect(scrollTo).toHaveBeenCalledWith({
      top: 700 + 1000 - 80,
      behavior: 'smooth',
    });
  });

  it('goes to the previous post with K, in either case', () => {
    feed([-300, 200, 700]);
    press('K');
    expect(scrollTo).toHaveBeenCalledWith({
      top: -300 + 1000 - 80,
      behavior: 'smooth',
    });
  });

  it('stays put past the last post and before the first', () => {
    const last = feed([-700, -300, 200]);
    press('j');
    last.unmount();

    feed([200, 700, 1200]);
    press('k');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('likes the post in the middle of the screen with L', () => {
    const { container } = feed([-300, 200, 700]);
    const clicked: string[] = [];
    for (const button of container.querySelectorAll<HTMLElement>(
      '[data-testid="like-button"]',
    )) {
      button.addEventListener('click', () =>
        clicked.push(button.dataset.index as string),
      );
    }

    press('l');

    expect(clicked).toEqual(['1']);
  });

  it('does nothing on a screen with no posts, or on a post with no like button', () => {
    const empty = feed([]);
    press('j');
    press('l');
    expect(scrollTo).not.toHaveBeenCalled();
    empty.unmount();

    const { container } = feed([200]);
    container.querySelector('[data-testid="like-button"]')?.remove();
    expect(() => press('l')).not.toThrow();
  });

  it('leaves the keys alone while the person is typing', () => {
    const { getByTestId } = feed([-300, 200, 700]);
    press('j', getByTestId('comment'));
    press('/', getByTestId('comment'));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(where).toBe('/');
  });

  it('leaves a key pressed with Ctrl to the browser', () => {
    feed([-300, 200, 700]);
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('goes to the search screen with the slash, from anywhere else', () => {
    feed([200], '/');
    const allowed = press('/');
    expect(where).toBe('/explore');
    expect(allowed).toBe(false);
  });

  it('stays quiet on the search screen when its field is not there yet', () => {
    feed([200], '/explore');
    expect(() => press('/')).not.toThrow();
    expect(where).toBe('/explore');
  });
});
