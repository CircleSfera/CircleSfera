import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import { timeLeft } from './CountdownClock';
import { CountdownWidget } from './CountdownWidget';

vi.mock('../../services/api', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const inAnHour = () => new Date(Date.now() + 3_600_000 + 5_000).toISOString();
const countdown = (over: object = {}) => ({
  data: {
    id: 'cd',
    kind: 'COUNTDOWN',
    settings: { title: 'Fiesta', endsAt: inAnHour() },
    totalResponses: 0,
    myResponse: null,
    ...over,
  },
});

beforeEach(() => vi.clearAllMocks());

describe('the time left of a countdown', () => {
  it('is split into days, hours, minutes and seconds, and never goes below zero', () => {
    const now = Date.parse('2026-10-20T10:00:00Z');
    expect(timeLeft('2026-10-22T13:04:05Z', now)).toEqual({
      done: false,
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
    expect(timeLeft('2026-10-20T09:00:00Z', now)).toMatchObject({
      done: true,
      days: 0,
      seconds: 0,
    });
  });
});

describe('CountdownWidget', () => {
  it('shows its title and the time left, and lets a viewer ask to be reminded and stop', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(countdown() as never);
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(
        countdown({ myResponse: { optionIndex: null, value: null } }) as never,
      )
      .mockResolvedValueOnce(countdown() as never);
    renderWithProviders(<CountdownWidget stickerId="cd" />, { lng: 'es' });

    expect(await screen.findByText('Fiesta')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('01');

    fireEvent.click(screen.getByRole('button', { name: 'Recordármelo' }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        'stories/stickers/cd/responses',
        { remind: true },
      ),
    );
    const reminded = await screen.findByRole('button', {
      name: 'Te lo recordaremos',
    });
    expect(reminded).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(reminded);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenLastCalledWith(
        'stories/stickers/cd/responses',
        { remind: false },
      ),
    );
  });

  it('offers no reminder to its author, nor once it has ended', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(countdown() as never);
    const { unmount } = renderWithProviders(
      <CountdownWidget stickerId="cd" isAuthor />,
      { lng: 'es' },
    );
    expect(await screen.findByText('Fiesta')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();

    vi.mocked(apiClient.get).mockResolvedValue(
      countdown({
        settings: {
          title: 'Fiesta',
          endsAt: new Date(Date.now() - 1000).toISOString(),
        },
      }) as never,
    );
    renderWithProviders(<CountdownWidget stickerId="cd" />, { lng: 'es' });
    expect(await screen.findByText('Ha terminado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says so when the reminder could not be saved', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => logged.mockRestore());
    vi.mocked(apiClient.get).mockResolvedValue(countdown() as never);
    vi.mocked(apiClient.post).mockRejectedValue(new Error('offline'));
    renderWithProviders(<CountdownWidget stickerId="cd" />, { lng: 'es' });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Recordármelo' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el recordatorio.',
    );
    expect(logged).toHaveBeenCalledWith(
      'Failed to set the reminder:',
      new Error('offline'),
    );
  });

  it('says so when the countdown could not be loaded', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => logged.mockRestore());
    vi.mocked(apiClient.get).mockRejectedValue(new Error('offline'));
    renderWithProviders(<CountdownWidget stickerId="cd" />, { lng: 'es' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la cuenta atrás.',
    );
    expect(logged).toHaveBeenCalledWith(
      'Failed to load countdown:',
      new Error('offline'),
    );
  });

  it('keeps an answer for a countdown no longer shown out of the one shown', async () => {
    let answerFirst: (v: unknown) => void = () => {};
    vi.mocked(apiClient.get)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answerFirst = resolve;
        }) as never,
      )
      .mockResolvedValueOnce(
        countdown({
          settings: { title: 'Concierto', endsAt: inAnHour() },
        }) as never,
      );
    const { rerender } = renderWithProviders(
      <CountdownWidget stickerId="cd" />,
      { lng: 'es' },
    );
    rerender(<CountdownWidget stickerId="cd-2" />);
    expect(await screen.findByText('Concierto')).toBeInTheDocument();

    answerFirst(countdown());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Fiesta')).not.toBeInTheDocument();
  });

  it('takes the reminder away when it ends while open', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      countdown({
        settings: {
          title: 'Fiesta',
          endsAt: new Date(Date.now() + 1200).toISOString(),
        },
      }) as never,
    );
    renderWithProviders(<CountdownWidget stickerId="cd" />, { lng: 'es' });
    expect(
      await screen.findByRole('button', { name: 'Recordármelo' }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText('Ha terminado', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
