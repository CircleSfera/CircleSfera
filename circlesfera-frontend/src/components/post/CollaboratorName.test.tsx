import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Post } from '../../types';
import CollaboratorName from './CollaboratorName';

describe('CollaboratorName', () => {
  it('names the co-author, with a way to its profile', () => {
    renderWithProviders(
      <CollaboratorName
        post={{ collaborator: { username: 'bea' } as Post['collaborator'] }}
      />,
      { lng: 'es' },
    );
    expect(screen.getByText('y')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/bea');
    expect(screen.getByRole('link')).toHaveTextContent('bea');
  });

  it('shows nothing on a post of one author', () => {
    const { container } = renderWithProviders(
      <CollaboratorName post={{ collaborator: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
