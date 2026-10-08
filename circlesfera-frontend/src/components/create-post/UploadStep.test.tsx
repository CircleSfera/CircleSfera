import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import UploadStep from './UploadStep';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor/camera', () => ({
  Camera: {},
  CameraResultType: {},
  CameraSource: {},
}));

describe('UploadStep density', () => {
  it('uses 48 px for the main action and 44 px for the mode tabs', () => {
    const fileInputRef = { current: null };
    renderWithProviders(
      <UploadStep
        fileInputRef={fileInputRef}
        handleFileSelect={vi.fn()}
        mode="FRAME"
        setMode={vi.fn()}
        allowModeSwitch
      />,
      { lng: 'es' },
    );

    const selectVideo = screen.getByRole('button', {
      name: 'Seleccionar video',
    });
    expect(selectVideo.className).toMatch(/min-h-12/);

    const frameTab = screen.getByRole('tab', { name: /Frame/i });
    expect(frameTab.className).toMatch(/min-h-11/);
  });
});
