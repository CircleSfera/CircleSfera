import { useEffect, useState } from 'react';
import type { StoryElement } from '../../types';

export function useStoryElements(options: {
  initialElements?: StoryElement[];
  onElementsChange?: (elements: StoryElement[]) => void;
}) {
  const { initialElements = [], onElementsChange } = options;

  const [elements, setInternalElements] =
    useState<StoryElement[]>(initialElements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  const [historyState, setHistoryState] = useState({
    stack: [initialElements],
    index: 0,
  });

  useEffect(() => {
    onElementsChange?.(elements);
  }, [elements, onElementsChange]);

  const pushHistory = (newElements: StoryElement[]) => {
    setHistoryState((prev) => {
      const newStack = prev.stack.slice(0, prev.index + 1);
      return {
        stack: [...newStack, newElements],
        index: newStack.length,
      };
    });
  };

  const undo = () => {
    setHistoryState((prev) => {
      if (prev.index > 0) {
        const newIndex = prev.index - 1;
        setInternalElements(prev.stack[newIndex]);
        return { ...prev, index: newIndex };
      }
      return prev;
    });
  };

  const redo = () => {
    setHistoryState((prev) => {
      if (prev.index < prev.stack.length - 1) {
        const newIndex = prev.index + 1;
        setInternalElements(prev.stack[newIndex]);
        return { ...prev, index: newIndex };
      }
      return prev;
    });
  };

  const updateElement = (id: string, updates: Partial<StoryElement>) => {
    setInternalElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...updates } : el)),
    );
  };

  /** Clears selection when removing the selected element; does not touch text input. */
  const removeElement = (id: string) => {
    setInternalElements((prev) => {
      const next = prev.filter((el) => el.id !== id);
      pushHistory(next);
      return next;
    });
    if (selectedElementId === id) {
      setSelectedElementId(null);
    }
  };

  const duplicateElement = (id: string) => {
    setInternalElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      const newEl: StoryElement = {
        ...el,
        id: crypto.randomUUID(),
        x: el.x + 20,
        y: el.y + 20,
      };
      const next = [...prev, newEl];
      pushHistory(next);
      setSelectedElementId(newEl.id);
      return next;
    });
  };

  const moveElementLayer = (id: string, direction: 'up' | 'down') => {
    setInternalElements((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      pushHistory(next);
      return next;
    });
  };

  const canUndo = historyState.index > 0;
  const canRedo = historyState.index < historyState.stack.length - 1;

  return {
    elements,
    setInternalElements,
    historyState,
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedElementId,
    setSelectedElementId,
    updateElement,
    removeElement,
    duplicateElement,
    moveElementLayer,
  };
}
