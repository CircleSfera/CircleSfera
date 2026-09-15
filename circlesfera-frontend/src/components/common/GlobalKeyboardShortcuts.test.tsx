import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { GlobalKeyboardShortcuts } from './GlobalKeyboardShortcuts';

describe('GlobalKeyboardShortcuts', () => {
  it('focuses explore search without matching an English placeholder', () => {
    renderWithProviders(
      <>
        <GlobalKeyboardShortcuts />
        <input data-testid="explore-search-input" />
      </>,
      { routerProps: { initialEntries: ['/explore'] } },
    );

    const input = screen.getByTestId('explore-search-input');
    expect(input).not.toHaveFocus();

    fireEvent.keyDown(window, { key: '/' });

    expect(input).toHaveFocus();
  });
});
