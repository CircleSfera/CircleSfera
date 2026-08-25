import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CreatorNavList from './CreatorNavList';

describe('CreatorNavList', () => {
  it('renders studio sections as real routes with the settings-style active wash', () => {
    render(
      <MemoryRouter initialEntries={['/creator/overview']}>
        <CreatorNavList />
      </MemoryRouter>,
    );

    const overview = screen.getByRole('link', { name: /resumen|overview/i });
    expect(overview).toHaveAttribute('href', '/creator/overview');
    expect(overview.className).toContain('bg-brand-primary/15');
    expect(overview.className).not.toContain('from-brand-primary');
    expect(
      screen.getByRole('link', { name: /analíticas|analytics/i }),
    ).toHaveAttribute('href', '/creator/analytics');
  });

  it('notifies the parent when a section is chosen', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <MemoryRouter initialEntries={['/creator/overview']}>
        <CreatorNavList onNavigate={onNavigate} />
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole('link', { name: /analíticas|analytics/i }),
    );
    expect(onNavigate).toHaveBeenCalled();
  });
});
