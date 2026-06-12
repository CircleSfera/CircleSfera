import { create } from 'zustand';
import type { Story } from '../types';

interface StoryState {
  isOpen: boolean;
  stories: Story[];
  initialIndex: number;
  openStories: (stories: Story[], index?: number) => void;
  closeStories: () => void;
}

export const useStoryStore = create<StoryState>((set) => ({
  isOpen: false,
  stories: [],
  initialIndex: 0,

  openStories: (stories, index = 0) => {
    set({
      stories,
      initialIndex: index,
      isOpen: true,
    });
  },

  closeStories: () => {
    set({
      isOpen: false,
      stories: [],
      initialIndex: 0,
    });
  },
}));
