import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/test-utils';
import StoryLinkPanel from './StoryLinkPanel';

describe('StoryLinkPanel', () => {
  it('adds a link once the address is a secure web address, with its short text', () => {
    const onAdd = vi.fn();
    renderWithProviders(<StoryLinkPanel onAdd={onAdd} />, { lng: 'es' });
    const add = screen.getByRole('button', { name: 'Añadir enlace' });
    const address = screen.getByRole('textbox', {
      name: 'Dirección del enlace',
    });
    expect(add).toBeDisabled();

    fireEvent.change(address, { target: { value: 'http://shop.example' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Solo se pueden añadir direcciones seguras (https)',
    );
    fireEvent.change(address, { target: { value: 'tienda' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe una dirección web',
    );
    expect(add).toBeDisabled();

    fireEvent.change(address, { target: { value: 'shop.example/x' } });
    const label = screen.getByRole('textbox', {
      name: 'Texto que se muestra en lugar de la dirección',
    });
    expect(label).toHaveAttribute('placeholder', 'shop.example');
    fireEvent.change(label, { target: { value: 'Mi tienda' } });
    fireEvent.click(add);

    expect(JSON.parse(onAdd.mock.calls[0][0].content)).toEqual({
      url: 'https://shop.example/x',
      domain: 'shop.example',
      label: 'Mi tienda',
    });
  });
});
