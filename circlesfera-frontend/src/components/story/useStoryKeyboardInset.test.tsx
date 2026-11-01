import { act, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import StoryTextTakeoverChrome from './StoryTextTakeoverChrome';
import { textCentreTop } from './StoryTextTakeoverEditor';
import { FONTS } from './storyComposer.constants';
import {
  keyboardInsetFrom,
  useStoryKeyboardInset,
} from './useStoryKeyboardInset';

/** A visual viewport that a test moves, as a phone's keyboard does. */
class FakeViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
  move(height: number, offsetTop = 0, type: 'resize' | 'scroll' = 'resize') {
    this.height = height;
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event(type));
  }
}

let viewport: FakeViewport;

beforeEach(() => {
  viewport = new FakeViewport();
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 844);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('keyboardInsetFrom', () => {
  it('is what the keyboard covers under the visual viewport', () => {
    expect(keyboardInsetFrom(844, { height: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInsetFrom(844, { height: 508, offsetTop: 0 })).toBe(336);
    // The page scrolled up inside the visual viewport.
    expect(keyboardInsetFrom(844, { height: 508, offsetTop: 100 })).toBe(236);
    // A viewport taller than the page covers nothing.
    expect(keyboardInsetFrom(500, { height: 844, offsetTop: 0 })).toBe(0);
  });
});

describe('useStoryKeyboardInset', () => {
  it('follows the visual viewport as the keyboard opens, scrolls and closes', () => {
    const { result } = renderHook(() => useStoryKeyboardInset());
    expect(result.current).toBe(0);

    act(() => viewport.move(508));
    expect(result.current).toBe(336);

    act(() => viewport.move(508, 40, 'scroll'));
    expect(result.current).toBe(296);

    act(() => viewport.move(844));
    expect(result.current).toBe(0);
  });

  it("takes the app keyboard's own height when the web view does not shrink", () => {
    const { result } = renderHook(() => useStoryKeyboardInset());

    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('keyboardWillShow'), { keyboardHeight: 300 }),
      );
    });
    expect(result.current).toBe(300);

    act(() => {
      window.dispatchEvent(new Event('keyboardWillHide'));
    });
    expect(result.current).toBe(0);
  });

  it('stops listening once gone', () => {
    const remove = vi.spyOn(viewport, 'removeEventListener');
    const { unmount } = renderHook(() => useStoryKeyboardInset());
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('is zero without a visual viewport', () => {
    vi.stubGlobal('visualViewport', undefined);
    const { result } = renderHook(() => useStoryKeyboardInset());
    expect(result.current).toBe(0);
  });
});

describe('text mode over the keyboard', () => {
  const renderChrome = () =>
    renderWithProviders(
      <StoryTextTakeoverChrome
        onDone={vi.fn()}
        textColor="#FFFFFF"
        onColorChange={vi.fn()}
        textStyle="classic"
        onStyleChange={vi.fn()}
        align="center"
        onAlignChange={vi.fn()}
        styleOptions={[]}
        fonts={FONTS}
        fontFamily="Outfit"
        onFontChange={vi.fn()}
        fontSize={24}
        onFontSizeChange={vi.fn()}
        letterSpacing={0}
        onLetterSpacingChange={vi.fn()}
        width={0}
        onWidthChange={vi.fn()}
        onGradientChange={vi.fn()}
        gradientPresets={[]}
      />,
      { lng: 'es' },
    );

  it('ends right where the keyboard begins, and keeps the safe area only without it', () => {
    renderChrome();
    const mode = screen.getByTestId('story-text-mode');
    const row = screen.getByTestId('story-text-bottom-row');
    expect(mode.style.bottom).toBe('0px');
    expect(row).toHaveClass('safe-area-bottom');

    act(() => viewport.move(508));
    expect(mode.style.bottom).toBe('336px');
    expect(row).not.toHaveClass('safe-area-bottom');
    // The fonts are the last row, right above the keyboard.
    expect(row.lastElementChild).toContainElement(
      screen.getByRole('button', { name: 'Outfit' }),
    );

    act(() => viewport.move(844));
    expect(mode.style.bottom).toBe('0px');
  });

  it('has no Cancel: Done ends the text', () => {
    renderChrome();
    expect(
      screen.queryByRole('button', { name: 'Cancelar' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listo' })).toBeEnabled();
  });
});

describe('textCentreTop', () => {
  const canvas = { top: 60, height: 700 };

  it('is the middle of the free band, from the top of the canvas', () => {
    // Band from 56 to 440 on the screen: its middle is at 248.
    expect(textCentreTop(canvas, { top: 56, height: 384 })).toBe(188);
  });

  it('stays on the canvas', () => {
    expect(textCentreTop(canvas, { top: 0, height: 40 })).toBe(0);
    expect(textCentreTop(canvas, { top: 900, height: 200 })).toBe(700);
  });

  it('is the middle of the canvas without a band', () => {
    expect(textCentreTop(canvas, null)).toBe(350);
    expect(textCentreTop(canvas, { top: 0, height: 0 })).toBe(350);
  });
});
