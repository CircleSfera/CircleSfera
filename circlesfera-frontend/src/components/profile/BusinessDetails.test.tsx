import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import BusinessDetails from './BusinessDetails';

describe('BusinessDetails', () => {
  it('shows the category, the address linked to its place page, and the contact buttons', () => {
    renderWithProviders(
      <BusinessDetails
        category="CAFE_BAKERY"
        email="hola@shop.es"
        phone="+34600111222"
        place={{
          id: 'place-1',
          name: 'Calle Mayor 1',
          fullName: 'Calle Mayor 1, Madrid',
          latitude: 40.41,
          longitude: -3.7,
        }}
      />,
    );

    expect(screen.getByText('Café or bakery')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Calle Mayor 1, Madrid' }),
    ).toHaveAttribute('href', '/explore/places/place-1');
    expect(
      screen.getByRole('link', { name: 'Call +34600111222' }),
    ).toHaveAttribute('href', 'tel:+34600111222');
    expect(
      screen.getByRole('link', { name: 'Email hola@shop.es' }),
    ).toHaveAttribute('href', 'mailto:hola@shop.es');
  });

  it('shows only what the business gave', () => {
    renderWithProviders(<BusinessDetails phone="+34600111222" />);

    expect(screen.getByRole('link', { name: /Call/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Email/ })).toBeNull();
  });

  it('shows nothing when none is set', () => {
    const { container } = renderWithProviders(<BusinessDetails />);
    expect(container).toBeEmptyDOMElement();
  });
});
