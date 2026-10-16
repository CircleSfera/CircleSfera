import { fireEvent, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/test-utils';
import StoryCountdownPanel, { toLocalInput } from './StoryCountdownPanel';

describe('StoryCountdownPanel', () => {
  afterEach(() => vi.useRealTimers());

  it('adds a countdown with its title and when it ends, by default tomorrow', () => {
    const onAdd = vi.fn();
    renderWithProviders(<StoryCountdownPanel onAdd={onAdd} />, { lng: 'es' });
    const add = screen.getByRole('button', { name: 'Añadir cuenta atrás' });
    expect(add).toBeDisabled();

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Título de la cuenta atrás' }),
      { target: { value: ' Fiesta ' } },
    );
    fireEvent.click(add);

    const [[el]] = onAdd.mock.calls;
    expect(el.type).toBe('countdown');
    const { title, endsAt } = JSON.parse(el.content);
    expect(title).toBe('Fiesta');
    const ahead = new Date(endsAt).getTime() - Date.now();
    expect(ahead).toBeGreaterThan(23 * 3_600_000);
    expect(ahead).toBeLessThan(26 * 3_600_000);
  });

  it('takes no moment in the past or more than 30 days ahead, and says why', () => {
    const onAdd = vi.fn();
    renderWithProviders(<StoryCountdownPanel onAdd={onAdd} />, { lng: 'es' });
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Título de la cuenta atrás' }),
      { target: { value: 'Fiesta' } },
    );
    const when = screen.getByLabelText('Cuándo termina');

    for (const moment of [
      new Date(Date.now() - 3_600_000),
      new Date(Date.now() + 40 * 24 * 3_600_000),
    ]) {
      fireEvent.change(when, { target: { value: toLocalInput(moment) } });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'entre un minuto y 30 días',
      );
      expect(
        screen.getByRole('button', { name: 'Añadir cuenta atrás' }),
      ).toBeDisabled();
    }
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('takes no time the calendar or the clock does not have, and says why', () => {
    renderWithProviders(<StoryCountdownPanel onAdd={vi.fn()} />, { lng: 'es' });
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Título de la cuenta atrás' }),
      { target: { value: 'Fiesta' } },
    );
    fireEvent.change(screen.getByLabelText('Cuándo termina'), {
      target: { value: `${new Date().getFullYear() + 1}-02-30T10:00` },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Esa hora no existe');
    expect(
      screen.getByRole('button', { name: 'Añadir cuenta atrás' }),
    ).toBeDisabled();
  });

  it('stops taking a moment that comes too close while the author waits', () => {
    vi.useFakeTimers();
    renderWithProviders(<StoryCountdownPanel onAdd={vi.fn()} />, { lng: 'es' });
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Título de la cuenta atrás' }),
      { target: { value: 'Fiesta' } },
    );
    const soon = new Date(Date.now() + 2 * 60_000);
    soon.setSeconds(0, 0);
    fireEvent.change(screen.getByLabelText('Cuándo termina'), {
      target: { value: toLocalInput(soon) },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'entre un minuto y 30 días',
    );
    expect(
      screen.getByRole('button', { name: 'Añadir cuenta atrás' }),
    ).toBeDisabled();
  });
});
