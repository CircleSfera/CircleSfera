import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import ChatDetailsModal from './ChatDetailsModal';

function renderDetails(
  props: Partial<React.ComponentProps<typeof ChatDetailsModal>> = {},
) {
  const handlers = {
    onClose: vi.fn(),
    onViewProfile: vi.fn(),
    onDeleteForMe: vi.fn(),
    onDeleteForEveryone: vi.fn(),
  };
  const view = renderWithProviders(
    <ChatDetailsModal
      isOpen
      person={{ username: 'ana', name: 'Ana Martín' }}
      isEncrypted
      {...handlers}
      {...props}
    />,
    { lng: 'es' },
  );
  return { ...view, ...handlers };
}

describe('ChatDetailsModal', () => {
  it('says who the conversation is with', () => {
    renderDetails();

    expect(screen.getByRole('dialog', { name: 'Detalles' })).toBeVisible();
    expect(screen.getByText('Ana Martín')).toBeInTheDocument();
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'ana' })).toBeInTheDocument();
  });

  it('offers the way to the profile and the two ways to delete', () => {
    const { onViewProfile, onDeleteForMe, onDeleteForEveryone } =
      renderDetails();

    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil' }));
    expect(onViewProfile).toHaveBeenCalledTimes(1);

    // Each way to delete says what it does.
    fireEvent.click(
      screen.getByRole('button', {
        name: /Eliminar para mí.*Desaparece solo de tu bandeja\./,
      }),
    );
    expect(onDeleteForMe).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', {
        name: /Eliminar para todos.*Desaparece para las dos personas\./,
      }),
    );
    expect(onDeleteForEveryone).toHaveBeenCalledTimes(1);
  });

  it('mentions the encryption only when the conversation has it', () => {
    const { unmount } = renderDetails();
    expect(screen.getByText('Cifrado de extremo a extremo')).toBeVisible();
    unmount();

    renderDetails({ isEncrypted: false });
    expect(
      screen.queryByText('Cifrado de extremo a extremo'),
    ).not.toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    renderDetails({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
