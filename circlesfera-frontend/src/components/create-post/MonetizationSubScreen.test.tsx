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

  it('shows what the creator keeps, the platform fee and the VAT inside, adding up to the price', () => {
    const { i18n } = renderWithProviders(<Harness />);

    fireEvent.change(
      screen.getByLabelText(i18n!.t('createPost.caption.price_eur')),
      { target: { value: '9.99' } },
    );

    expect(screen.getByTestId('price')).toHaveTextContent('9.99');
    // 999 cents paid in the EU: 173 of VAT inside, and the 826 left split,
    // the fee rounded down: 165 for the platform, 661 for the creator.
    expect(screen.getByText('€6.61')).toBeInTheDocument();
    expect(screen.getByText('€1.65')).toBeInTheDocument();
    expect(screen.getByText('€1.73')).toBeInTheDocument();
    expect(
      screen.getByText('VAT inside, when bought from the EU (21%)'),
    ).toBeInTheDocument();
  });

  it('writes the amounts as currency in Spanish', () => {
    renderWithProviders(<Harness initialPrice={10} />, { lng: 'es' });

    // 10 € paid: 1,74 € of VAT, 1,65 € fee, 6,61 € for the creator.
    expect(screen.getByText(/^6,61\s€$/)).toBeInTheDocument();
    expect(screen.getByText(/^1,65\s€$/)).toBeInTheDocument();
    expect(screen.getByText(/^1,74\s€$/)).toBeInTheDocument();
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
