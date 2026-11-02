import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BrandAmbientBackground from './BrandAmbientBackground';

describe('BrandAmbientBackground', () => {
  it.each(['story', 'editor'] as const)(
    'fades to the base colour at the top and the bottom (%s)',
    (placement) => {
      render(<BrandAmbientBackground placement={placement} />);

      const edges = screen.getByTestId('brand-background-edges');
      expect(edges.style.background).toContain('linear-gradient(to bottom');
      expect(edges.style.background).toMatch(
        /^linear-gradient\(to bottom, var\(--surface-base\) 0(px)?,.*var\(--surface-base\) 100%\)$/,
      );
    },
  );
});
