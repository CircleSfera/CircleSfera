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
  const originalCatch = promise.catch.bind(promise);
  // Spy on the original promise's catch so the component's handler runs
  // against the real rejection and its own failures surface.
  return Object.assign(promise, {
    catch: vi.fn((onRejected: (reason: unknown) => unknown) =>
      originalCatch(onRejected),
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

  it('handles the rejected haptics call when the platform cannot vibrate', async () => {
    renderWithProviders(<BottomNav />);
    for (const link of screen.getAllByRole('link')) fireEvent.click(link);

    const calls = vi.mocked(Haptics.impact).mock.results;
    expect(calls.length).toBeGreaterThan(0);
    for (const { value } of calls) {
      const catchSpy = (value as { catch: ReturnType<typeof vi.fn> }).catch;
      expect(catchSpy).toHaveBeenCalled();
      // Await the handler's own promise: a handler that throws fails here.
      await Promise.all(catchSpy.mock.results.map((r) => r.value));
    }
  });
});
