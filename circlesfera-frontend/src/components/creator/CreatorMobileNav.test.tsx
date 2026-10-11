import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import CreatorShell from './CreatorShell';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/creator/overview']}>
      <CreatorShell activeTab="overview">
        <Where />
      </CreatorShell>
    </MemoryRouter>,
  );
}

const menuButton = () =>
  screen.getByRole('button', { name: /open navigation|abrir navegación/i });

async function openSheet() {
  const user = userEvent.setup();
  await user.click(menuButton());
  const sheet = await screen.findByRole('dialog', {
    name: /sections|secciones/i,
  });
  return { user, sheet };
}

describe('the section menu of the creator panel on a phone', () => {
  it('is not in the page until it is opened', () => {
    renderShell();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens as a titled sheet with every section under its group', async () => {
    renderShell();
    const { sheet } = await openSheet();

    expect(
      within(sheet).getByText(/choose a section|elige una sección/i),
    ).toBeInTheDocument();
    expect(within(sheet).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(within(sheet).getAllByRole('link')).toHaveLength(6);
  });

  it('marks the open section as the current page', async () => {
    renderShell();
    const { sheet } = await openSheet();

    expect(
      within(sheet).getByRole('link', { name: /overview|resumen/i }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(sheet).getByRole('link', { name: /analytics|analíticas/i }),
    ).not.toHaveAttribute('aria-current');
  });

  it('holds the keyboard inside and stops the page behind from scrolling', async () => {
    renderShell();
    const { sheet } = await openSheet();

    await waitFor(() =>
      expect(sheet).toContainElement(document.activeElement as HTMLElement),
    );
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('opens the chosen section and closes', async () => {
    renderShell();
    const { user, sheet } = await openSheet();

    await user.click(
      within(sheet).getByRole('link', { name: /analytics|analíticas/i }),
    );

    expect(screen.getByTestId('where')).toHaveTextContent('/creator/analytics');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('closes with Escape and gives the focus back to the menu button', async () => {
    renderShell();
    const { user, sheet } = await openSheet();
    await waitFor(() =>
      expect(sheet).toContainElement(document.activeElement as HTMLElement),
    );

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(menuButton()).toHaveFocus();
  });

  it('closes from its close button', async () => {
    renderShell();
    const { user, sheet } = await openSheet();

    await user.click(
      within(sheet).getByRole('button', { name: /close|cerrar/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});
