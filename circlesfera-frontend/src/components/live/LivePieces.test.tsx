import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { LiveControl, LiveSheet, LiveStatus } from './LivePieces';

describe('the pieces of a Live screen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says the broadcast is live, for how long and how many watch', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    const startedAt = Date.now() - 65_000;
    renderWithProviders(<LiveStatus startedAt={startedAt} viewers={12} />);

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByTestId('live-clock')).toHaveTextContent('01:05');
    expect(screen.getByText('12')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_600_000);
    });
    expect(screen.getByTestId('live-clock')).toHaveTextContent('1:01:05');
  });

  it('shows no clock before the broadcast has a start', () => {
    renderWithProviders(<LiveStatus viewers={0} />);

    expect(screen.queryByTestId('live-clock')).not.toBeInTheDocument();
  });

  it('names a control and marks the one that draws a thing switched off', () => {
    renderWithProviders(
      <LiveControl label="Unmute the microphone" tone="on" aria-pressed>
        x
      </LiveControl>,
    );

    const control = screen.getByRole('button', {
      name: 'Unmute the microphone',
    });
    expect(control).toHaveAttribute('aria-pressed', 'true');
    expect(control.className).toContain('h-11');
    expect(control.className).toContain('w-11');
  });

  it('opens one sheet with its title and closes it from its button, from outside and with Escape', () => {
    const onClose = vi.fn();
    const { rerender } = renderWithProviders(
      <LiveSheet isOpen={false} onClose={onClose} title="Questions">
        <p>inside</p>
      </LiveSheet>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <LiveSheet isOpen onClose={onClose} title="Questions">
        <p>inside</p>
      </LiveSheet>,
    );
    expect(
      screen.getByRole('dialog', { name: 'Questions' }),
    ).toBeInTheDocument();
    // No taller than about two thirds of the screen: the video stays in sight.
    expect(screen.getByRole('dialog').className).toContain('max-h-[66%]');

    const closers = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closers[0]);
    fireEvent.click(closers[1]);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
