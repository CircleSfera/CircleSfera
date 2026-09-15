import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStudioStore } from '../../stores/studioStore';
import { renderWithProviders } from '../../test/test-utils';
import type { StudioProject } from '../../types/studio';
import Playhead from './Playhead';

const project: StudioProject = {
  id: 'p1',
  name: 'Test',
  tracks: [],
  duration: 10,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('Playhead', () => {
  beforeEach(() => {
    useStudioStore.setState({
      project,
      playhead: 0,
      zoom: 40,
    });
  });

  it('labels the control from the catalog', () => {
    const { i18n } = renderWithProviders(<Playhead />);
    expect(
      screen.getByRole('slider', { name: i18n!.t('studio.playhead') }),
    ).toBeInTheDocument();
    expect(i18n!.t('studio.playhead')).toBe('Playhead');
  });

  it('uses the Spanish playhead label', () => {
    const { i18n } = renderWithProviders(<Playhead />, { lng: 'es' });
    expect(i18n!.t('studio.playhead')).toBe('Cabezal de reproducción');
    expect(
      screen.getByRole('slider', { name: i18n!.t('studio.playhead') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('slider', { name: 'Playhead' }),
    ).not.toBeInTheDocument();
  });
});
