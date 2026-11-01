import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStoryShareRowPlace } from './useStoryShareRowPlace';

function band(height: number, safeBottom: number) {
  const el = document.createElement('div');
  el.style.paddingBottom = `${safeBottom}px`;
  Object.defineProperty(el, 'clientHeight', { value: height });
  return { current: el };
}

describe('useStoryShareRowPlace', () => {
  it('stands the row in a band of 150 px under the story', () => {
    const { result } = renderHook(() =>
      useStoryShareRowPlace(band(150, 0), false),
    );
    expect(result.current).toBe('band');
  });

  it('lays the row over the story when the band, without the safe area, is under 56 px', () => {
    // 90 px tall, 34 of them the bottom safe area: 56 px is left, it fits.
    expect(
      renderHook(() => useStoryShareRowPlace(band(90, 34), false)).result
        .current,
    ).toBe('band');
    // 89 px tall: 55 px is left, it does not.
    expect(
      renderHook(() => useStoryShareRowPlace(band(89, 34), false)).result
        .current,
    ).toBe('over');
  });

  it('keeps the row under an open panel', () => {
    const { result } = renderHook(() =>
      useStoryShareRowPlace(band(300, 0), true),
    );
    expect(result.current).toBe('panel');
  });
});
