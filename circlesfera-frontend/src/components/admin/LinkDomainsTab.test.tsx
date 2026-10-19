import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import { adminToast } from './adminToast';
import LinkDomainsTab from './LinkDomainsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getLinkDomainsPage: vi.fn(),
    blockLinkDomain: vi.fn(),
    unblockLinkDomain: vi.fn(),
  },
}));
vi.mock('./adminToast', () => ({ adminToast: vi.fn() }));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

const evil = {
  id: 'd-1',
  domain: 'evil.example',
  reason: 'phishing',
  createdAt: '2026-10-16T10:00:00Z',
  createdBy: { id: 'a-1', displayName: 'Ana' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminApi.getLinkDomainsPage).mockResolvedValue({
    data: { items: [evil], nextCursor: null },
  } as never);
});

describe('LinkDomainsTab', () => {
  it('lists the blocked domains with why and who added them, and searches them', async () => {
    renderWithProviders(<LinkDomainsTab />, { lng: 'es' });

    expect((await screen.findAllByText('evil.example')).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText('phishing').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Añadido por Ana/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText('Buscar dominios'), {
      target: { value: 'evil' },
    });
    await waitFor(() =>
      expect(adminApi.getLinkDomainsPage).toHaveBeenLastCalledWith(
        'evil',
        undefined,
      ),
    );
  });

  it('blocks a domain with why, and empties the form', async () => {
    vi.mocked(adminApi.blockLinkDomain).mockResolvedValue({
      data: { ...evil, domain: 'spam.example' },
    } as never);
    renderWithProviders(<LinkDomainsTab />, { lng: 'es' });

    const domain = screen.getByLabelText('Dominio');
    fireEvent.change(domain, { target: { value: ' spam.example ' } });
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear dominio' }));

    await waitFor(() =>
      expect(adminApi.blockLinkDomain).toHaveBeenCalledWith(
        'spam.example',
        'spam',
      ),
    );
    await waitFor(() =>
      expect(adminToast).toHaveBeenCalledWith(
        'spam.example bloqueado',
        'success',
      ),
    );
    expect(domain).toHaveValue('');
  });

  it.each([
    [409, 'Ese dominio ya está bloqueado'],
    [400, 'Escribe un nombre de dominio, como ejemplo.com'],
    [500, 'No se pudo guardar el cambio'],
  ])('says why a domain was not blocked (%i)', async (status, text) => {
    vi.mocked(adminApi.blockLinkDomain).mockRejectedValue(
      Object.assign(new Error('no'), {
        isAxiosError: true,
        response: { status },
      }),
    );
    renderWithProviders(<LinkDomainsTab />, { lng: 'es' });

    fireEvent.change(screen.getByLabelText('Dominio'), {
      target: { value: 'evil.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear dominio' }));

    await waitFor(() => expect(adminToast).toHaveBeenCalledWith(text, 'error'));
  });

  it('asks before unblocking, then unblocks', async () => {
    vi.mocked(adminApi.unblockLinkDomain).mockResolvedValue({
      data: { id: 'd-1', domain: 'evil.example' },
    } as never);
    renderWithProviders(<LinkDomainsTab />, { lng: 'es' });

    const [unblock] = await screen.findAllByRole('button', {
      name: 'Desbloquear',
    });
    fireEvent.click(unblock);
    expect(screen.getByText('¿Desbloquear evil.example?')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Desbloquear' });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(adminApi.unblockLinkDomain).toHaveBeenCalledWith('d-1'),
    );
    await waitFor(() =>
      expect(adminToast).toHaveBeenCalledWith(
        'evil.example desbloqueado',
        'success',
      ),
    );
  });

  it('says the list could not be loaded, rather than that it is empty, and tries again', async () => {
    vi.mocked(adminApi.getLinkDomainsPage)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        data: { items: [evil], nextCursor: null },
      } as never);
    renderWithProviders(<LinkDomainsTab />, { lng: 'es' });

    expect(
      await screen.findByText('No se pudieron cargar los dominios bloqueados.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect((await screen.findAllByText('evil.example')).length).toBeGreaterThan(
      0,
    );
  });

  it('reads the next page when the end of the list scrolls into view', async () => {
    type Seen = (entries: { isIntersecting: boolean }[]) => void;
    const observers: Seen[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: Seen) {
          observers.push(callback);
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.mocked(adminApi.getLinkDomainsPage).mockImplementation((async (
      _search?: string,
      cursor?: string,
    ) => ({
      data: cursor
        ? {
            items: [{ ...evil, id: 'd-2', domain: 'zz.example' }],
            nextCursor: null,
          }
        : { items: [evil], nextCursor: 'after-evil' },
    })) as never);
    renderWithProviders(<LinkDomainsTab />, { lng: 'es' });

    await screen.findAllByText('evil.example');
    expect(screen.queryByText('zz.example')).not.toBeInTheDocument();

    act(() => {
      for (const seen of observers) seen([{ isIntersecting: true }]);
    });

    expect((await screen.findAllByText('zz.example'))[0]).toBeInTheDocument();
    expect(adminApi.getLinkDomainsPage).toHaveBeenCalledWith(
      undefined,
      'after-evil',
    );
    vi.unstubAllGlobals();
  });
});
