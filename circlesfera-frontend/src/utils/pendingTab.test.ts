import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropPendingTab, openPendingTab, sendPendingTab } from './pendingTab';

const tabStub = (closed = false) =>
  ({
    closed,
    opener: window,
    close: vi.fn(),
    location: { replace: vi.fn() },
  }) as unknown as Window & {
    close: ReturnType<typeof vi.fn>;
    location: { replace: ReturnType<typeof vi.fn> };
  };

describe('pendingTab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens an empty tab at once, before any address is known', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openPendingTab();

    expect(open).toHaveBeenCalledWith('', '_blank');
  });

  it('sends the tab to the address and cuts its handle on this page', () => {
    const tab = tabStub();

    sendPendingTab(tab, 'https://connect.stripe.com/express/x');

    expect(tab.location.replace).toHaveBeenCalledWith(
      'https://connect.stripe.com/express/x',
    );
    expect(tab.opener).toBeNull();
  });

  it.each([
    ['could not be opened', null],
    ['was closed meanwhile', tabStub(true)],
  ])('goes there in this page when the tab %s', (_what, tab) => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });

    sendPendingTab(tab, 'https://connect.stripe.com/express/x');

    expect(assign).toHaveBeenCalledWith('https://connect.stripe.com/express/x');
  });

  it('closes a tab whose address never arrived, and ignores one that is gone', () => {
    const tab = tabStub();
    dropPendingTab(tab);
    expect(tab.close).toHaveBeenCalled();

    const gone = tabStub(true);
    dropPendingTab(gone);
    dropPendingTab(null);
    expect(gone.close).not.toHaveBeenCalled();
  });
});
