import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import LiveGuestChips from './LiveGuestChips';

describe('LiveGuestChips', () => {
  it('shows each guest with where they are, and takes one off', () => {
    const onRemove = vi.fn();
    renderWithProviders(
      <LiveGuestChips
        guests={[
          { profileId: 'p1', username: 'ana', status: 'ON_AIR' },
          { profileId: 'p2', username: 'luis', status: 'INVITED' },
          { profileId: 'p3', username: 'eva' },
        ]}
        onRemove={onRemove}
      />,
      { lng: 'es' },
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('En directo')).toBeInTheDocument();
    expect(screen.getByText('Invitado')).toBeInTheDocument();
    expect(screen.getByText('Se invitará al empezar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar a @luis' }));
    expect(onRemove).toHaveBeenCalledWith('p2');
  });

  it('draws nothing with no guests', () => {
    const { container } = renderWithProviders(
      <LiveGuestChips guests={[]} onRemove={vi.fn()} />,
    );
    expect(container.querySelector('ul')).toBeNull();
  });
});
