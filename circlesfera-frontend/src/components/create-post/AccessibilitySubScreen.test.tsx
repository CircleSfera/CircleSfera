import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import AccessibilitySubScreen from './AccessibilitySubScreen';

const item = (url: string, type = 'image') => ({
  url,
  type,
  file: new File(['x'], 'a'),
});

function show(
  media = [item('blob:a'), item('blob:b')],
  onGenerateAltText: (index: number) => Promise<void> = async () => {},
) {
  const seen = { alt: {} as Record<number, string> };
  const onClose = vi.fn();
  function Screen() {
    const [alt, setAlt] = useState<Record<number, string>>({ 1: 'A dog' });
    seen.alt = alt;
    return (
      <AccessibilitySubScreen
        mediaFiles={media}
        altTextMap={alt}
        setAltTextMap={setAlt}
        onClose={onClose}
        onGenerateAltText={onGenerateAltText}
      />
    );
  }
  renderWithProviders(<Screen />);
  return { seen, onClose };
}

describe('AccessibilitySubScreen', () => {
  it('shows one description per file, with what was already written', () => {
    show();

    const fields = screen.getAllByPlaceholderText('Write alt text...');
    expect(fields).toHaveLength(2);
    expect(fields[0]).toHaveValue('');
    expect(fields[1]).toHaveValue('A dog');
  });

  it('keeps what is written for each file apart', () => {
    const { seen } = show();

    fireEvent.change(screen.getAllByPlaceholderText('Write alt text...')[0], {
      target: { value: 'A beach at dawn' },
    });

    expect(seen.alt).toEqual({ 0: 'A beach at dawn', 1: 'A dog' });
  });

  it('asks the assistant for the description of that photo, and waits for it', async () => {
    let finish: () => void = () => {};
    const generate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    show(undefined, generate);

    fireEvent.click(screen.getAllByRole('button', { name: 'Generate' })[1]);

    expect(generate).toHaveBeenCalledWith(1);
    const busy = screen.getByRole('button', { name: 'Generating...' });
    expect(busy).toBeDisabled();
    // The other photo can still be described meanwhile.
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();

    await act(async () => finish());

    expect(screen.getAllByRole('button', { name: 'Generate' })).toHaveLength(2);
  });

  it('has a video described by hand', () => {
    show([item('blob:v', 'video')]);

    expect(
      screen.getByPlaceholderText('Describe this video…'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
    expect(
      screen.getByText(/Video descriptions are written by hand for now/),
    ).toBeInTheDocument();
  });

  it('goes back from the arrow and from Done', () => {
    const { onClose } = show();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
