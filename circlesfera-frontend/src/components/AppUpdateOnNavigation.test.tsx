import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateOnNavigation } from './AppUpdateOnNavigation';

const { loadAppUpdate } = vi.hoisted(() => ({
  loadAppUpdate: vi.fn(() => false),
}));
vi.mock('../utils/appUpdates', () => ({ loadAppUpdate }));

function app(start = '/') {
  const router = createMemoryRouter(
    [{ path: '*', element: <AppUpdateOnNavigation /> }],
    { initialEntries: [start] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('AppUpdateOnNavigation', () => {
  beforeEach(() => loadAppUpdate.mockClear());

  it('does not load a new version on the screen the app opened on', () => {
    app('/');
    expect(loadAppUpdate).not.toHaveBeenCalled();
  });

  it('loads a new version when the person moves to another screen', async () => {
    const router = app('/');
    await act(() => router.navigate('/explore'));
    expect(loadAppUpdate).toHaveBeenCalledTimes(1);
  });

  it('waits on screens that open with what the last one handed over', async () => {
    const router = app('/edits');
    await act(() => router.navigate('/create?mode=frame'));
    await act(() => router.navigate('/edits'));
    expect(loadAppUpdate).not.toHaveBeenCalled();

    await act(() => router.navigate('/'));
    expect(loadAppUpdate).toHaveBeenCalledTimes(1);
  });
});
