import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  CreatorFigure,
  CreatorRow,
  CreatorSection,
  CreatorViewChoice,
} from './CreatorPieces';

describe('creator pieces', () => {
  it('draws a figure with its label, its value and what it measures', () => {
    render(<CreatorFigure label="Reach" value="1,200" hint="Views" />);

    expect(screen.getByText('Reach')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('Views')).toBeInTheDocument();
  });

  it('gives a section a heading and one link to the rest', () => {
    render(
      <MemoryRouter>
        <CreatorSection
          title="Latest posts"
          link={{ label: 'See all', to: '/x' }}
        >
          <p>body</p>
        </CreatorSection>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Latest posts' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute(
      'href',
      '/x',
    );
  });

  it('opens a row from its body and keeps its action apart', () => {
    const onOpen = vi.fn();
    const onAct = vi.fn();
    render(
      <CreatorRow
        title="First light"
        facts={['3 likes', 'at your average']}
        onOpen={onOpen}
        openLabel="Statistics of: First light"
        action={
          <button type="button" onClick={onAct}>
            Promote
          </button>
        }
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Promote' }));
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Statistics of: First light' }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is not a button when a row opens nothing', () => {
    render(<CreatorRow title="Plain" />);

    expect(screen.getByText('Plain')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('marks the chosen view and tells which one is picked', () => {
    const onChange = vi.fn();
    render(
      <CreatorViewChoice
        label="Kind"
        items={[
          { value: 'all', label: 'All' },
          { value: 'frames', label: 'Frames' },
        ]}
        value="all"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Frames' }));
    expect(onChange).toHaveBeenCalledWith('frames');
  });
});
