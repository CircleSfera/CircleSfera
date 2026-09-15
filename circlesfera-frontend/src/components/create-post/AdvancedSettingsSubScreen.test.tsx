import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import AdvancedSettingsSubScreen from './AdvancedSettingsSubScreen';

const baseProps = {
  hideLikes: false,
  setHideLikes: vi.fn(),
  turnOffComments: false,
  setTurnOffComments: vi.fn(),
  isSensitive: false,
  setIsSensitive: vi.fn(),
  scheduledAt: '',
  setScheduledAt: vi.fn(),
  onClose: vi.fn(),
};

describe('AdvancedSettingsSubScreen', () => {
  it('lets the author mark a post as sensitive without adult or 18+ language', () => {
    renderWithProviders(
      <AdvancedSettingsSubScreen {...baseProps} showSensitiveToggle />,
      { lng: 'es' },
    );

    expect(
      screen.getByRole('switch', {
        name: 'Marcar como contenido sensible',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Violencia gráfica, lenguaje fuerte/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/18\+/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mature/i)).not.toBeInTheDocument();
  });

  it('toggles sensitive content on', () => {
    const setIsSensitive = vi.fn();
    renderWithProviders(
      <AdvancedSettingsSubScreen
        {...baseProps}
        setIsSensitive={setIsSensitive}
        showSensitiveToggle
      />,
      { lng: 'es' },
    );

    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Marcar como contenido sensible',
      }),
    );
    expect(setIsSensitive).toHaveBeenCalledWith(true);
  });

  it('hides the sensitive toggle for stories', () => {
    renderWithProviders(
      <AdvancedSettingsSubScreen {...baseProps} showSensitiveToggle={false} />,
      { lng: 'es' },
    );

    expect(
      screen.queryByRole('switch', {
        name: 'Marcar como contenido sensible',
      }),
    ).not.toBeInTheDocument();
  });
});
