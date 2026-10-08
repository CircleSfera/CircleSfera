import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import MonetizationSubScreen from './MonetizationSubScreen';

function Harness({
  initialPrice = 0,
  initialPremium = true,
  onClose = vi.fn(),
}: {
  initialPrice?: number;
  initialPremium?: boolean;
  onClose?: () => void;
}) {
  const [isPremium, setIsPremium] = useState(initialPremium);
  const [price, setPrice] = useState(initialPrice);
  return (
    <>
      <MonetizationSubScreen
        isPremium={isPremium}
        setIsPremium={setIsPremium}
        price={price}
        setPrice={setPrice}
        onClose={onClose}
      />
      <output data-testid="price">{price}</output>
    </>
  );
}

describe('MonetizationSubScreen', () => {
  it('asks for a price only when the content is paid', () => {
    const { i18n } = renderWithProviders(<Harness initialPremium={false} />);
    const paid = screen.getByRole('switch', {
      name: i18n!.t('createPost.caption.premium_content'),
    });

    expect(
      screen.queryByLabelText(i18n!.t('createPost.caption.price_eur')),
    ).not.toBeInTheDocument();

    fireEvent.click(paid);

    expect(
      screen.getByLabelText(i18n!.t('createPost.caption.price_eur')),
    ).toBeInTheDocument();
  });

  it('shows what the creator keeps and the platform fee, adding up to the price', () => {
    const { i18n } = renderWithProviders(<Harness />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('createPost.caption.price_eur')),
      { target: { value: '9.99' } },
    );

    expect(screen.getByTestId('price')).toHaveTextContent('9.99');
    // 999 cents: 799 for the creator and 200 for the platform.
    expect(screen.getByText('€7.99')).toBeInTheDocument();
    expect(screen.getByText('€2.00')).toBeInTheDocument();
  });

  it('writes the amounts as currency in Spanish', () => {
    renderWithProviders(<Harness initialPrice={10} />, { lng: 'es' });

    expect(screen.getByText(/^8,00\s€$/)).toBeInTheDocument();
    expect(screen.getByText(/^2,00\s€$/)).toBeInTheDocument();
  });

  it.each([
    [2.5, 'createPost.caption.min_price_warning'],
    [500.5, 'createPost.caption.max_price_warning'],
  ])(
    'warns about a price outside the allowed range (%s) and hides the split',
    (price, key) => {
      const { i18n } = renderWithProviders(<Harness initialPrice={price} />);

      expect(screen.getByText(i18n!.t(key))).toBeInTheDocument();
      expect(
        screen.queryByText(i18n!.t('createPost.caption.creator_earning')),
      ).not.toBeInTheDocument();
    },
  );

  it('treats an emptied price as no price', () => {
    const { i18n } = renderWithProviders(<Harness initialPrice={5} />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('createPost.caption.price_eur')),
      { target: { value: '' } },
    );

    expect(screen.getByTestId('price')).toHaveTextContent('0');
    expect(
      screen.queryByText(i18n!.t('createPost.caption.creator_earning')),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(i18n!.t('createPost.caption.min_price_warning')),
    ).not.toBeInTheDocument();
  });
});
