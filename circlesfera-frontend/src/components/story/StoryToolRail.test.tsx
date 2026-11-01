import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import StoryToolRail from './StoryToolRail';
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

function renderRail(lng: 'es' | 'en' = 'es') {
  const onSelectTab = vi.fn();
  renderWithProviders(
    <StoryToolRail activeTab="none" onSelectTab={onSelectTab} share={share} />,
    { lng },
  );
  const rail = screen.getByRole('toolbar');
  return { onSelectTab, rail };
}

const names = () =>
  screen.queryAllByTestId('story-tool-name').map((n) => n.textContent);

describe('StoryToolRail', () => {
  it('shows the tool names beside the icons from the chevron at the end, and hides them again', () => {
    const { rail } = renderRail();
    const buttons = within(rail).getAllByRole('button');
    const chevron = buttons.at(-1) as HTMLElement;

    expect(chevron).toHaveAccessibleName('Mostrar nombres de las herramientas');
    expect(chevron).toHaveAttribute('aria-expanded', 'false');
    expect(names()).toEqual([]);

    fireEvent.click(chevron);

    expect(names()).toEqual([
      'Texto',
      'Stickers',
      'Dibujar',
      'Fondo',
      'Plantillas',
      'Música',
      'Ubicación',
    ]);
    expect(chevron).toHaveAccessibleName('Ocultar nombres de las herramientas');
    expect(chevron).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(chevron);
    expect(names()).toEqual([]);
  });

  it('names the tools in English too, with the background tool written out', () => {
    const { rail } = renderRail('en');
    fireEvent.click(
      within(rail).getByRole('button', { name: 'Show tool names' }),
    );

    expect(names()).toContain('Background');
    expect(
      within(rail).getByRole('button', { name: 'Hide tool names' }),
    ).toBeInTheDocument();
  });

  it('keeps every control a 44 px target with a name for screen readers', () => {
    const { rail } = renderRail();
    fireEvent.click(
      within(rail).getByRole('button', {
        name: 'Mostrar nombres de las herramientas',
      }),
    );

    for (const button of within(rail).getAllByRole('button')) {
      expect(button.getAttribute('aria-label')).toBeTruthy();
      // At least 44 px tall and wide, named or not.
      expect(button.className.split(' ')).toContain('h-11');
      expect(button.className.split(' ')).toContain('min-w-11');
    }
  });

  it('gives each icon over the story a soft shadow so it reads on a white picture', () => {
    const { rail } = renderRail();
    const idle = within(rail)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') !== 'true');

    expect(idle.length).toBeGreaterThan(0);
    for (const button of idle) {
      expect(button.className).toContain(
        '*:[filter:drop-shadow(0_0_1px_rgba(0,0,0,0.55))_drop-shadow(0_1px_2px_rgba(0,0,0,0.35))_drop-shadow(0_0_4px_rgba(0,0,0,0.2))]',
      );
    }
  });

  it('still opens a tool, with the names shown', () => {
    const { rail, onSelectTab } = renderRail();
    fireEvent.click(
      within(rail).getByRole('button', {
        name: 'Mostrar nombres de las herramientas',
      }),
    );
    fireEvent.click(within(rail).getByRole('button', { name: 'Dibujar' }));

    expect(onSelectTab).toHaveBeenCalledWith('draw');
  });
});
