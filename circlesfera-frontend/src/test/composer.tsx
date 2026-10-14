import type { ReactElement } from 'react';
import {
  type Composer,
  ComposerProvider,
} from '../components/create-post/ComposerContext';
import { renderWithProviders } from './test-utils';

/**
 * Shows a screen of the composer with the part of the composer a test cares
 * about; a screen that reads anything else gets nothing for it.
 */
export function renderInComposer(
  ui: ReactElement,
  composer: Record<string, unknown>,
) {
  return renderWithProviders(
    <ComposerProvider value={composer as unknown as Composer}>
      {ui}
    </ComposerProvider>,
  );
}
