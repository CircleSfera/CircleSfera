import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import StoryComposerChrome from './StoryComposerChrome';
import type { StoryShareOptions } from './storyShare.types';

const share: StoryShareOptions = {
  closeFriendsCount: 0,
  onManageCloseFriends: vi.fn(),
  isSharing: false,
  musicTitle: null,
  onOpenMusic: vi.fn(),
  placeName: null,
  placeStickerName: null,
  onOpenPlace: vi.fn(),
};

function renderChrome() {
  renderWithProviders(
    <StoryComposerChrome
      onClose={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      canUndo
      canRedo
      activeTab="none"
      onSelectTab={vi.fn()}
      hidden={false}
      pointerArmed
      share={share}
    />,
    { lng: 'es' },
  );
}

const chromeButtons = () => [
  screen.getByRole('button', { name: 'Cerrar' }),
  screen.getByRole('button', { name: 'Deshacer' }),
  screen.getByRole('button', { name: 'Rehacer' }),
  ...within(screen.getByRole('toolbar')).getAllByRole('button'),
];

describe('StoryComposerChrome', () => {
  it('draws every icon of the chrome at 20 px: close, undo, redo, the tools and the chevron', () => {
    renderChrome();
    const sizes = () =>
      chromeButtons().flatMap((b) =>
        Array.from(b.querySelectorAll('svg')).map((svg) => [
          svg.getAttribute('width'),
          svg.getAttribute('height'),
        ]),
      );

    expect(sizes().length).toBe(11);
    expect(new Set(sizes().flat())).toEqual(new Set(['20']));

    // With the names shown, the chevron turns and keeps the size.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Mostrar nombres de las herramientas',
      }),
    );
    expect(new Set(sizes().flat())).toEqual(new Set(['20']));
  });

  it('gives close, undo and redo the same soft shadow as the tools', () => {
    renderChrome();
    const shadow = (b: HTMLElement) =>
      b.className.split(' ').find((c) => c.startsWith('*:[filter:'));
    const toolShadow = shadow(
      within(screen.getByRole('toolbar')).getByRole('button', {
        name: 'Texto',
      }),
    );

    expect(toolShadow).toBeTruthy();
    for (const name of ['Cerrar', 'Deshacer', 'Rehacer']) {
      expect(shadow(screen.getByRole('button', { name }))).toBe(toolShadow);
    }
  });
});
