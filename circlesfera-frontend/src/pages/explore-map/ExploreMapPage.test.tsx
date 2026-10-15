import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import ExploreMapPage from './ExploreMapPage';

const mapInstance = {
  addControl: vi.fn(),
  on: vi.fn(),
  remove: vi.fn(),
  resize: vi.fn(),
  getBounds: vi.fn(() => null),
  easeTo: vi.fn(),
  getZoom: vi.fn(() => 11),
};

vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    workerClass: undefined,
    Map: vi.fn(function MapboxMapMock() {
      return mapInstance;
    }),
    Marker: vi.fn(),
    AttributionControl: vi.fn(),
  },
}));

vi.mock('mapbox-gl/dist/mapbox-gl-csp-worker?worker', () => ({
  default: vi.fn(),
}));

vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/react', () => sentry);

vi.mock('../../services', () => ({
  placesApi: {
    getMap: vi.fn().mockResolvedValue({ data: { data: [] } }),
    getById: vi.fn(),
    getPosts: vi.fn(),
  },
}));

function renderPage() {
  return renderWithProviders(
    <div className="h-[800px]">
      <ExploreMapPage />
    </div>,
  );
}

describe('ExploreMapPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it('opens on the place it was sent to, as from a story’s location', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test-token');
    const { placesApi } = await import('../../services');
    vi.mocked(placesApi.getById).mockResolvedValue({
      data: { id: 'pl-1', name: 'Madrid' },
    } as never);
    renderWithProviders(
      <div className="h-[800px]">
        <ExploreMapPage />
      </div>,
      { routerProps: { initialEntries: ['/explore/map?place=pl-1'] } },
    );

    await vi.waitFor(() =>
      expect(placesApi.getById).toHaveBeenCalledWith('pl-1'),
    );
    expect(
      screen.queryByTestId('explore-map-places-chip'),
    ).not.toBeInTheDocument();
  });

  it('shows token missing state when Mapbox token is absent', () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '');
    const { i18n } = renderPage();
    expect(
      screen.getByText(i18n!.t('explore.map.token_missing')),
    ).toBeInTheDocument();
  });

  it('shows a compact places chip instead of a full-width primary CTA', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test-token');
    const user = userEvent.setup();
    renderPage();

    const chip = await screen.findByTestId('explore-map-places-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).not.toHaveClass('w-full');
    expect(chip.className).not.toMatch(/bg-brand-primary/);

    await user.click(chip);
    const sheet = await screen.findByTestId('explore-map-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet.className).toMatch(/md:w-\[min\(100%-2rem,360px\)\]/);
    expect(sheet.className).toMatch(/md:left-1\/2/);
    expect(sheet.className).not.toMatch(/md:right-4/);
    expect(
      screen.queryByTestId('explore-map-places-chip'),
    ).not.toBeInTheDocument();
  });

  it('tells the person to reload when the map fails, without the technical cause', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test-token');
    const { i18n } = renderPage();

    const onError = mapInstance.on.mock.calls.find(
      ([event]) => event === 'error',
    )?.[1] as (event: { error?: Error }) => void;
    act(() => onError({ error: new Error('Unauthorized: 401 tile request') }));

    expect(
      await screen.findByText(i18n!.t('explore.map.render_error_hint')),
    ).toBeInTheDocument();
    expect(screen.queryByText(/401 tile request/)).not.toBeInTheDocument();
  });

  it('reports why the map failed, without the map key', () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test-token');
    renderPage();

    const onError = mapInstance.on.mock.calls.find(
      ([event]) => event === 'error',
    )?.[1] as (event: { error?: Error }) => void;
    act(() =>
      onError({
        error: new Error(
          'Unauthorized: https://api.mapbox.com/v4/tile.png?access_token=pk.secret&x=1',
        ),
      }),
    );

    const [[reported]] = sentry.captureException.mock.calls;
    expect(reported.message).toContain('access_token=[redacted]&x=1');
    expect(reported.message).not.toContain('pk.secret');
  });

  it('does not render the generic area label when the map has no pins', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test-token');
    const user = userEvent.setup();
    const { i18n } = renderPage();

    expect(
      screen.getByText(i18n!.t('explore.map.page_title')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n!.t('explore.map.area_generic')),
    ).not.toBeInTheDocument();

    await user.click(await screen.findByTestId('explore-map-places-chip'));
    expect(
      await screen.findByRole('dialog', {
        name: i18n!.t('explore.map.title'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n!.t('explore.map.area_generic')),
    ).not.toBeInTheDocument();
  });
});
