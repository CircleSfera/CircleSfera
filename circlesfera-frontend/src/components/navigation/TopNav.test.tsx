import { Haptics } from '@capacitor/haptics';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import TopNav from './TopNav';

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

describe('TopNav', () => {
  it('labels home, notifications, and messages from the catalog', () => {
    const { i18n } = renderWithProviders(<TopNav />);

    expect(
      screen.getByRole('link', { name: i18n!.t('nav.home') }),
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.notifications') }),
    ).toHaveAttribute('href', '/activity');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.messages') }),
    ).toHaveAttribute('href', '/direct/inbox');
    expect(screen.queryByRole('link', { name: 'Notificaciones' })).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'Mensajes directos' }),
    ).toBeNull();
  });

  it('uses Spanish catalog labels', () => {
    const { i18n } = renderWithProviders(<TopNav />, { lng: 'es' });

    expect(i18n!.t('nav.notifications')).toBe('Notificaciones');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.notifications') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.messages') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.home') }),
    ).toBeInTheDocument();
  });

  it('handles the rejected haptics call when the platform cannot vibrate', async () => {
    renderWithProviders(<TopNav />);
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
