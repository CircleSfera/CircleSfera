import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StoryElement } from '../../types';
import { useStoryElements } from './useStoryElements';

const element = (
  id: string,
  over: Partial<StoryElement> = {},
): StoryElement => ({
  id,
  type: 'sticker',
  content: id,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  ...over,
});

const ids = (elements: StoryElement[]) => elements.map((e) => e.id);

describe('useStoryElements', () => {
  it('starts from the given elements with nothing to undo or redo', () => {
    const { result } = renderHook(() =>
      useStoryElements({ initialElements: [element('a')] }),
    );

    expect(ids(result.current.elements)).toEqual(['a']);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.selectedElementId).toBeNull();
  });

  it('reports every change of the elements to the owner', () => {
    const onElementsChange = vi.fn();
    const { result } = renderHook(() =>
      useStoryElements({
        initialElements: [element('a')],
        onElementsChange,
      }),
    );

    act(() => result.current.removeElement('a'));

    expect(onElementsChange).toHaveBeenLastCalledWith([]);
  });

  it('removes an element, and brings it back with undo and away again with redo', () => {
    const { result } = renderHook(() =>
      useStoryElements({ initialElements: [element('a'), element('b')] }),
    );

    act(() => result.current.removeElement('a'));
    expect(ids(result.current.elements)).toEqual(['b']);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(ids(result.current.elements)).toEqual(['a', 'b']);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(ids(result.current.elements)).toEqual(['b']);
    expect(result.current.canRedo).toBe(false);
  });

  it('drops the redo steps once a new change is made after an undo', () => {
    const { result } = renderHook(() =>
      useStoryElements({
        initialElements: [element('a'), element('b'), element('c')],
      }),
    );

    act(() => result.current.removeElement('a'));
    act(() => result.current.undo());
    act(() => result.current.removeElement('c'));

    expect(ids(result.current.elements)).toEqual(['a', 'b']);
    expect(result.current.canRedo).toBe(false);
  });

  it('clears the selection only when the selected element is removed', () => {
    const { result } = renderHook(() =>
      useStoryElements({ initialElements: [element('a'), element('b')] }),
    );

    act(() => result.current.setSelectedElementId('a'));
    act(() => result.current.removeElement('b'));
    expect(result.current.selectedElementId).toBe('a');

    act(() => result.current.removeElement('a'));
    expect(result.current.selectedElementId).toBeNull();
  });

  it('duplicates an element next to the original and selects the copy', () => {
    const { result } = renderHook(() =>
      useStoryElements({
        initialElements: [element('a', { x: 10, y: 5, content: '🔥' })],
      }),
    );

    act(() => result.current.duplicateElement('a'));

    const [original, copy] = result.current.elements;
    expect(result.current.elements).toHaveLength(2);
    expect(copy).toMatchObject({ content: '🔥', x: 30, y: 25 });
    expect(copy.id).not.toBe(original.id);
    expect(result.current.selectedElementId).toBe(copy.id);
    expect(result.current.canUndo).toBe(true);
  });

  it('ignores duplicating an element that does not exist', () => {
    const { result } = renderHook(() =>
      useStoryElements({ initialElements: [element('a')] }),
    );

    act(() => result.current.duplicateElement('missing'));

    expect(ids(result.current.elements)).toEqual(['a']);
    expect(result.current.canUndo).toBe(false);
  });

  it('moves an element one layer up or down and stops at the ends', () => {
    const { result } = renderHook(() =>
      useStoryElements({
        initialElements: [element('a'), element('b'), element('c')],
      }),
    );

    act(() => result.current.moveElementLayer('a', 'up'));
    expect(ids(result.current.elements)).toEqual(['b', 'a', 'c']);

    act(() => result.current.moveElementLayer('a', 'down'));
    expect(ids(result.current.elements)).toEqual(['a', 'b', 'c']);

    act(() => result.current.moveElementLayer('a', 'down'));
    act(() => result.current.moveElementLayer('c', 'up'));
    act(() => result.current.moveElementLayer('missing', 'up'));
    expect(ids(result.current.elements)).toEqual(['a', 'b', 'c']);
  });

  it('changes the fields of one element and leaves the others alone', () => {
    const { result } = renderHook(() =>
      useStoryElements({ initialElements: [element('a'), element('b')] }),
    );

    act(() => result.current.updateElement('a', { scale: 2, rotation: 45 }));

    expect(result.current.elements[0]).toMatchObject({
      scale: 2,
      rotation: 45,
    });
    expect(result.current.elements[1]).toMatchObject({ scale: 1, rotation: 0 });
  });
});
