import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import QuickFilterRow from './QuickFilterRow';

function sized(
  el: HTMLElement,
  sizes: { scrollWidth: number; clientWidth: number; scrollLeft: number },
) {
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(el, key, { configurable: true, value });
  }
}

describe('QuickFilterRow', () => {
  it('fades its right edge only while more filters follow past it', () => {
    renderWithProviders(
      <QuickFilterRow ratio="4 / 5" selectedClass="" onSelect={vi.fn()} />,
      { lng: 'es' },
    );
    const strip = screen.getByRole('group', { name: 'Filtros' });

    sized(strip, { scrollWidth: 900, clientWidth: 360, scrollLeft: 0 });
    fireEvent.scroll(strip);
    expect(strip).toHaveAttribute('data-more', 'true');

    // At the end of the strip, the last filter shows whole.
    sized(strip, { scrollWidth: 900, clientWidth: 360, scrollLeft: 540 });
    fireEvent.scroll(strip);
    expect(strip).not.toHaveAttribute('data-more');
  });

  it('has no fade when every filter fits', () => {
    renderWithProviders(
      <QuickFilterRow ratio="4 / 5" selectedClass="" onSelect={vi.fn()} />,
      { lng: 'es' },
    );
    const strip = screen.getByRole('group', { name: 'Filtros' });
    sized(strip, { scrollWidth: 300, clientWidth: 360, scrollLeft: 0 });
    fireEvent.scroll(strip);
    expect(strip).not.toHaveAttribute('data-more');
  });
});
