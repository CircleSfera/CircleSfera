import { createContext, useContext } from 'react';
import type { useCreatePost } from '../../hooks/useCreatePost';

/** Everything the composer holds: what is being created and how to change it. */
export type Composer = ReturnType<typeof useCreatePost>;

const ComposerContext = createContext<Composer | null>(null);

export const ComposerProvider = ComposerContext.Provider;

// The composer the screen is part of. Its screens read what they need from
// here instead of receiving it value by value.
export function useComposer(): Composer {
  const composer = useContext(ComposerContext);
  if (!composer) {
    throw new Error('This screen is shown outside the composer');
  }
  return composer;
}
