import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { MusicSticker } from './MusicSticker';

const track = { title: 'Luz', artist: 'Ana', cover: 'https://c/1.jpg' };

describe('MusicSticker', () => {
  it('shows the song and turns the story’s sound on, then off', () => {
    const onToggleSound = vi.fn();
    const { rerender } = renderWithProviders(
      <MusicSticker track={track} muted onToggleSound={onToggleSound} />,
      { lng: 'es' },
    );

    const on = screen.getByRole('button', {
      name: 'Activar el sonido: Luz, Ana',
    });
    expect(on).toHaveAttribute('aria-pressed', 'false');
    expect(on).toHaveTextContent('Luz');
    expect(on).toHaveTextContent('Ana');
    expect(on.querySelector('img')).toHaveAttribute('src', track.cover);
    fireEvent.click(on);
    expect(onToggleSound).toHaveBeenCalledTimes(1);

    rerender(
      <MusicSticker
        track={track}
        muted={false}
        onToggleSound={onToggleSound}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Silenciar el sonido: Luz, Ana' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a note where the song has no cover', () => {
    renderWithProviders(
      <MusicSticker
        track={{ ...track, cover: null }}
        muted
        onToggleSound={vi.fn()}
      />,
    );
    expect(screen.getByRole('button').querySelector('img')).toBeNull();
  });
});
