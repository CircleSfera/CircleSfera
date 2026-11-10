import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { LiveCameraPreview } from './LiveCameraPreview';

describe('the camera preview before going live', () => {
  it('shows the front camera as a mirror, and the reason when there is no picture', () => {
    const ref = { current: null };
    const { rerender } = renderWithProviders(
      <LiveCameraPreview videoRef={ref} state="on" facing="user" />,
    );
    expect(screen.getByTestId('live-preview').className).toContain(
      '-scale-x-100',
    );

    rerender(
      <LiveCameraPreview videoRef={ref} state="refused" facing="environment" />,
    );
    expect(screen.getByTestId('live-preview').className).not.toContain(
      '-scale-x-100',
    );
    expect(
      screen.getByText(/The camera could not be opened/),
    ).toBeInTheDocument();

    // No camera at all reads the same.
    rerender(<LiveCameraPreview videoRef={ref} state="none" facing="user" />);
    expect(
      screen.getByText(/The camera could not be opened/),
    ).toBeInTheDocument();
  });
});
