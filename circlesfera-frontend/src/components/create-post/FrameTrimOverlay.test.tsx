import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRAME_MAX_DURATION_SEC } from '../../constants/uploadLimits';
import { renderWithProviders } from '../../test/test-utils';
import { FRAME_DURATION_PRESETS } from '../../utils/frameClip';
import FrameTrimOverlay from './FrameTrimOverlay';

vi.mock('../ui', () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

describe('FrameTrimOverlay', () => {
  afterEach(() => {
    cleanup();
  });

  const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
  const midPreset = FRAME_DURATION_PRESETS[1];
  const longPreset = FRAME_DURATION_PRESETS[2];
  const maxPreset = FRAME_DURATION_PRESETS[3];

  it('disables presets longer than the source and applies a mid-length chip', () => {
    const onConfirm = vi.fn();
    const { i18n } = renderWithProviders(
      <FrameTrimOverlay
        file={file}
        url="blob:test"
        sourceDurationSec={45}
        initialWindow={{ startTime: 0, endTime: 45 }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
      { lng: 'es' },
    );

    const presetLabel = (seconds: number) =>
      i18n!.t('createPost.frameTrim.preset_seconds', { seconds });

    expect(
      screen.getByRole('button', { name: presetLabel(longPreset) }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: presetLabel(maxPreset) }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', { name: presetLabel(midPreset) }),
    );
    fireEvent.click(screen.getByLabelText(i18n!.t('createPost.edit.done')));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: 0,
        endTime: midPreset,
        muted: false,
      }),
    );
  });

  it('keeps the Frame max preset enabled when source is long enough', () => {
    const { i18n } = renderWithProviders(
      <FrameTrimOverlay
        file={file}
        url="blob:test"
        sourceDurationSec={180}
        initialWindow={{ startTime: 0, endTime: FRAME_MAX_DURATION_SEC }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
      { lng: 'es' },
    );

    expect(
      screen.getByRole('button', {
        name: i18n!.t('createPost.frameTrim.preset_seconds', {
          seconds: maxPreset,
        }),
      }),
    ).not.toBeDisabled();
  });
});
