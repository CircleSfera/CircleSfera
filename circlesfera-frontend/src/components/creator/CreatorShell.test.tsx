import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import CreatorShell from './CreatorShell';

describe('CreatorShell', () => {
  it('renders the section rail and page title like Settings', () => {
    render(
      <MemoryRouter initialEntries={['/creator/overview']}>
        <CreatorShell activeTab="overview">
          <p>Overview body</p>
        </CreatorShell>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /resumen|overview/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Overview body')).toBeInTheDocument();
    // The content area takes the focus on a section change. It is not a main
    // landmark of its own: the layout around it already is the one of the page.
    expect(document.getElementById('creator-main')).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByTestId('creator-sidebar')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /resumen|overview/i }),
    ).toHaveAttribute('href', '/creator/overview');
    expect(
      screen.queryByRole('button', { name: /new content|nuevo contenido/i }),
    ).not.toBeInTheDocument();
  });
});
