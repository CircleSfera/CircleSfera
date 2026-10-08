import { useEffect, useReducer, useState } from 'react';
import type { StoryElement } from '../../types';

/**
 * The elements of a story and their undo history, as one piece of state.
 *
 * They change together in one step, so the history can never disagree with
 * what is on screen whatever order the browser delivers events in.
 */
interface ElementsState {
  elements: StoryElement[];
  /** Every undo step, oldest first; `index` is the one on screen. */
  stack: StoryElement[][];
  index: number;
}

type ElementsAction =
  | {
      type: 'change';
      change: (elements: StoryElement[]) => StoryElement[];
      /** Whether the result is an undo step by itself. */
      record: boolean;
    }
  | { type: 'commit' }
  | { type: 'undo' }
  | { type: 'redo' };

const sameElements = (a: StoryElement[], b: StoryElement[]) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/** Adds the elements as a new step, unless they are what the last step has. */
function withStep(state: ElementsState, elements: StoryElement[]) {
  if (sameElements(state.stack[state.index], elements)) {
    return { ...state, elements };
  }
  const kept = state.stack.slice(0, state.index + 1);
  return { elements, stack: [...kept, elements], index: kept.length };
}

function reduce(state: ElementsState, action: ElementsAction): ElementsState {
  switch (action.type) {
    case 'change': {
      const elements = action.change(state.elements);
      if (elements === state.elements) return state;
      return action.record ? withStep(state, elements) : { ...state, elements };
    }
    case 'commit':
      return withStep(state, state.elements);
    case 'undo': {
      if (state.index === 0) return state;
      const index = state.index - 1;
      return { ...state, index, elements: state.stack[index] };
    }
    case 'redo': {
      if (state.index >= state.stack.length - 1) return state;
      const index = state.index + 1;
      return { ...state, index, elements: state.stack[index] };
    }
  }
}

export function useStoryElements(options: {
  initialElements?: StoryElement[];
  onElementsChange?: (elements: StoryElement[]) => void;
}) {
  const { initialElements = [], onElementsChange } = options;

  const [state, dispatch] = useReducer(reduce, initialElements, (elements) => ({
    elements,
    stack: [elements],
    index: 0,
  }));
  const { elements } = state;
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    onElementsChange?.(elements);
  }, [elements, onElementsChange]);

  /** Changes the elements; the result is one undo step. */
  const changeElements = (
    change: (elements: StoryElement[]) => StoryElement[],
  ) => dispatch({ type: 'change', change, record: true });

  const undo = () => dispatch({ type: 'undo' });
  const redo = () => dispatch({ type: 'redo' });

  /**
   * Changes an element as it is being adjusted. This is not an undo step by
   * itself: a slider or a drag changes the element many times, and the whole
   * gesture is one step, made by `commitElements` when it ends.
   */
  const updateElement = (id: string, updates: Partial<StoryElement>) =>
    dispatch({
      type: 'change',
      record: false,
      change: (current) =>
        current.map((el) => (el.id === id ? { ...el, ...updates } : el)),
    });

  /**
   * Makes the elements as they are now one undo step. Called when a gesture
   * ends (a slider is released, a drag is dropped, a button is pressed).
   * Calling it when nothing changed since the last step does nothing.
   */
  const commitElements = () => dispatch({ type: 'commit' });

  /** Clears selection when removing the selected element; does not touch text input. */
  const removeElement = (id: string) => {
    changeElements((current) => current.filter((el) => el.id !== id));
    if (selectedElementId === id) {
      setSelectedElementId(null);
    }
  };

  const duplicateElement = (id: string) => {
    if (!elements.some((el) => el.id === id)) return;
    const copyId = crypto.randomUUID();
    changeElements((current) => {
      const el = current.find((e) => e.id === id);
      if (!el) return current;
      return [...current, { ...el, id: copyId, x: el.x + 20, y: el.y + 20 }];
    });
    setSelectedElementId(copyId);
  };

  const moveElementLayer = (id: string, direction: 'up' | 'down') =>
    changeElements((current) => {
      const idx = current.findIndex((e) => e.id === id);
      if (idx === -1) return current;
      const newIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (newIdx < 0 || newIdx >= current.length) return current;
      const next = [...current];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });

  const canUndo = state.index > 0;
  const canRedo = state.index < state.stack.length - 1;

  return {
    elements,
    changeElements,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedElementId,
    setSelectedElementId,
    updateElement,
    commitElements,
    removeElement,
    duplicateElement,
    moveElementLayer,
  };
}
