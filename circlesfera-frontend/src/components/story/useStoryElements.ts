import { useCallback, useEffect, useReducer, useState } from 'react';
import type { StoryElement } from '../../types';
import { STORY_PHOTO_IDENTITY, type StoryPhotoEdit } from './storyPhoto';

/** What one undo step holds: the pieces and the photo's place and filter. */
interface Snapshot {
  elements: StoryElement[];
  photo: StoryPhotoEdit;
}

/**
 * The elements of a story, the edit of its photo and their undo history, as
 * one piece of state.
 *
 * They change together in one step, so the history can never disagree with
 * what is on screen whatever order the browser delivers events in.
 */
interface ElementsState extends Snapshot {
  /** Every undo step, oldest first; `index` is the one on screen. */
  stack: Snapshot[];
  index: number;
}

type ElementsAction =
  | {
      type: 'change';
      change: (elements: StoryElement[]) => StoryElement[];
      /** Whether the result is an undo step by itself. */
      record: boolean;
    }
  | {
      type: 'photo';
      change: (photo: StoryPhotoEdit) => StoryPhotoEdit;
      record: boolean;
    }
  | { type: 'resetPhoto' }
  | { type: 'commit' }
  | { type: 'undo' }
  | { type: 'redo' };

const sameSnapshot = (a: Snapshot, b: Snapshot) =>
  (a.elements === b.elements ||
    JSON.stringify(a.elements) === JSON.stringify(b.elements)) &&
  (a.photo === b.photo || JSON.stringify(a.photo) === JSON.stringify(b.photo));

/** Adds what is on screen as a new step, unless the last step has it. */
function withStep(state: ElementsState, now: Snapshot): ElementsState {
  if (sameSnapshot(state.stack[state.index], now)) {
    return { ...state, ...now };
  }
  const kept = state.stack.slice(0, state.index + 1);
  const step = { elements: now.elements, photo: now.photo };
  return { ...step, stack: [...kept, step], index: kept.length };
}

const snapshotOf = (state: ElementsState): Snapshot => ({
  elements: state.elements,
  photo: state.photo,
});

function reduce(state: ElementsState, action: ElementsAction): ElementsState {
  switch (action.type) {
    case 'change': {
      const elements = action.change(state.elements);
      if (elements === state.elements) return state;
      return action.record
        ? withStep(state, { elements, photo: state.photo })
        : { ...state, elements };
    }
    case 'photo': {
      const photo = action.change(state.photo);
      if (photo === state.photo) return state;
      return action.record
        ? withStep(state, { elements: state.elements, photo })
        : { ...state, photo };
    }
    case 'resetPhoto': {
      // Another background: no step keeps the place of the one before.
      const photo = STORY_PHOTO_IDENTITY;
      return {
        ...state,
        photo,
        stack: state.stack.map((step) => ({ ...step, photo })),
      };
    }
    case 'commit':
      return withStep(state, snapshotOf(state));
    case 'undo': {
      if (state.index === 0) return state;
      const index = state.index - 1;
      return { ...state, index, ...state.stack[index] };
    }
    case 'redo': {
      if (state.index >= state.stack.length - 1) return state;
      const index = state.index + 1;
      return { ...state, index, ...state.stack[index] };
    }
  }
}

export function useStoryElements(options: {
  initialElements?: StoryElement[];
  onElementsChange?: (elements: StoryElement[]) => void;
}) {
  const { initialElements = [], onElementsChange } = options;

  const [state, dispatch] = useReducer(reduce, initialElements, (elements) => {
    const first = { elements, photo: STORY_PHOTO_IDENTITY };
    return { ...first, stack: [first], index: 0 };
  });
  const { elements, photo } = state;
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    onElementsChange?.(elements);
  }, [elements, onElementsChange]);

  /** Changes the elements; the result is one undo step. */
  const changeElements = useCallback(
    (change: (elements: StoryElement[]) => StoryElement[]) =>
      dispatch({ type: 'change', change, record: true }),
    [],
  );

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

  /** Moves, scales or turns the photo as a gesture goes; not a step yet. */
  const updatePhoto = useCallback(
    (updates: Partial<StoryPhotoEdit>) =>
      dispatch({
        type: 'photo',
        record: false,
        change: (current) => ({ ...current, ...updates }),
      }),
    [],
  );

  /** Changes the photo as one undo step by itself (a filter, say). */
  const changePhoto = useCallback(
    (change: (photo: StoryPhotoEdit) => StoryPhotoEdit) =>
      dispatch({ type: 'photo', record: true, change }),
    [],
  );

  /** Puts the photo back as it came, in every step: the background changed. */
  const resetPhoto = useCallback(() => dispatch({ type: 'resetPhoto' }), []);

  /**
   * Makes the elements and the photo as they are now one undo step. Called when a gesture
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
    photo,
    updatePhoto,
    changePhoto,
    resetPhoto,
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
