import { screen } from '@testing-library/react';
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
