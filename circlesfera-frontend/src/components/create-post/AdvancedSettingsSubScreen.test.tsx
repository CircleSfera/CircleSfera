import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
    render(<AdvancedSettingsSubScreen {...baseProps} showSensitiveToggle />);

    expect(
      screen.getByRole('switch', {
        name: /createPost\.caption\.mark_sensitive$/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/createPost\.caption\.mark_sensitive_desc/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/18\+/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mature/i)).not.toBeInTheDocument();
  });

  it('toggles sensitive content on', () => {
    const setIsSensitive = vi.fn();
    render(
      <AdvancedSettingsSubScreen
        {...baseProps}
        setIsSensitive={setIsSensitive}
        showSensitiveToggle
      />,
    );

    fireEvent.click(
      screen.getByRole('switch', {
        name: /createPost\.caption\.mark_sensitive$/,
      }),
    );
    expect(setIsSensitive).toHaveBeenCalledWith(true);
  });

  it('hides the sensitive toggle for stories', () => {
    render(
      <AdvancedSettingsSubScreen {...baseProps} showSensitiveToggle={false} />,
    );

    expect(
      screen.queryByRole('switch', {
        name: /createPost\.caption\.mark_sensitive$/,
      }),
    ).not.toBeInTheDocument();
  });
});
