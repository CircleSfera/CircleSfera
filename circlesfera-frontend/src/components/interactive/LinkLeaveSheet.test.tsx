import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportsApi } from '../../services/reports.service';
import { renderWithProviders } from '../../test/test-utils';
import { LinkLeaveSheet, LinkSticker } from './LinkLeaveSheet';

vi.mock('../../services/reports.service', () => ({
  reportsApi: { create: vi.fn() },
}));

const link = {
  url: 'https://shop.example/x?ref=1',
  domain: 'shop.example',
  label: 'Mi tienda',
};

function show() {
  const onClose = vi.fn();
  renderWithProviders(
    <LinkLeaveSheet link={link} storyId="s-1" onClose={onClose} />,
    { lng: 'es' },
  );
  return onClose;
}

describe('a link on a story', () => {
  let open: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    open = vi.fn();
    vi.stubGlobal('open', open);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows its short text, and asks before opening', () => {
    const onOpen = vi.fn();
    renderWithProviders(<LinkSticker link={link} onOpen={onOpen} />, {
      lng: 'es',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir el enlace a shop.example' }),
    );

    expect(screen.getByText('MI TIENDA')).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('says the viewer is leaving and where to, and opens it outside with nothing passed on', () => {
    const onClose = show();

    expect(
      screen.getByRole('dialog', { name: 'Vas a salir de CircleSfera' }),
    ).toHaveTextContent('shop.example');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir enlace' }));

    expect(open).toHaveBeenCalledWith(
      'https://shop.example/x?ref=1',
      '_blank',
      'noopener,noreferrer',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('reports the story as a scam, naming the domain', async () => {
    vi.mocked(reportsApi.create).mockResolvedValue({} as never);
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Denunciar enlace' }));

    expect(
      await screen.findByRole('button', { name: 'Denunciado. Gracias' }),
    ).toBeDisabled();
    expect(reportsApi.create).toHaveBeenCalledWith({
      targetType: 'STORY',
      targetId: 's-1',
      reason: 'SCAM',
      details: 'Link: shop.example',
    });
  });

  it('says so when the report could not be sent', async () => {
    vi.mocked(reportsApi.create).mockRejectedValue(new Error('offline'));
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Denunciar enlace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo enviar la denuncia.',
    );
  });

  it('closes with Cancel, outside it, or Escape, opening nothing', async () => {
    const onClose = show();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByTestId('link-sheet-backdrop'));
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(3));
    expect(open).not.toHaveBeenCalled();
  });
});
