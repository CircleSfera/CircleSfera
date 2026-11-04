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

  it('offers the way to the profile and deleting it for you only', () => {
    const { onViewProfile, onDeleteForMe } = renderDetails();

    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil' }));
    expect(onViewProfile).toHaveBeenCalledTimes(1);

    // Deleting says what it does; nobody deletes it for the other person.
    fireEvent.click(
      screen.getByRole('button', {
        name: /Eliminar para mí.*Desaparece solo de tu bandeja\./,
      }),
    );
    expect(onDeleteForMe).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: /Eliminar para todos/ }),
    ).not.toBeInTheDocument();
  });

  // The messages are encrypted on the servers, not end to end: the chat
  // says so, and never claims end-to-end encryption.
  it('says the messages are encrypted on the servers, and never end to end', () => {
    const { unmount } = renderDetails();
    expect(screen.getByText('Cifrados en nuestros servidores')).toBeVisible();
    expect(
      screen.queryByText(/extremo a extremo|E2EE/),
    ).not.toBeInTheDocument();
    unmount();

    renderDetails({ isEncrypted: false });
    expect(
      screen.queryByText('Cifrados en nuestros servidores'),
    ).not.toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    renderDetails({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
