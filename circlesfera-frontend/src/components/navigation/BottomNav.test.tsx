import { Haptics } from '@capacitor/haptics';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import BottomNav from './BottomNav';

// Mirrors iOS Safari on the web, where the Haptics web implementation
// rejects because there is no vibration API.
const rejectedImpact = () => {
  const promise = Promise.reject(
    new Error('Browser does not support the vibrate API'),
  );
  const handled = promise.catch(() => {});
  return Object.assign(promise, {
    catch: vi.fn((onRejected: (reason: unknown) => unknown) =>
      handled.then(() => undefined, onRejected),
    ),
  });
};

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(() => rejectedImpact()) },
  ImpactStyle: { Light: 'LIGHT' },
}));

describe('BottomNav', () => {
  it('labels the landmark and destinations from the catalog', () => {
    const { i18n } = renderWithProviders(<BottomNav />);

    expect(
      screen.getByRole('navigation', { name: i18n!.t('nav.mobile') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.home') }),
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.search') }),
    ).toHaveAttribute('href', '/explore');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.frames') }),
    ).toHaveAttribute('href', '/frames');
  });

  it('handles the rejected haptics call when the platform cannot vibrate', () => {
    renderWithProviders(<BottomNav />);
    for (const link of screen.getAllByRole('link')) fireEvent.click(link);

    const calls = vi.mocked(Haptics.impact).mock.results;
    expect(calls.length).toBeGreaterThan(0);
    for (const { value } of calls) {
      expect(
        (value as { catch: ReturnType<typeof vi.fn> }).catch,
      ).toHaveBeenCalled();
    }
  });
});
