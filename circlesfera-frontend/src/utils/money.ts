// Amounts travel as integer cents; the platform charges in EUR.
export function formatCents(
  cents: number,
  language: string,
  currency = 'EUR',
): string {
  return (cents / 100).toLocaleString(language, {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
}

// A whole amount of euros with no decimals, for fixed choices such as tips.
export function formatWholeEuros(euros: number, language: string): string {
  return euros.toLocaleString(language, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

// The VAT a buyer pays on top of a price before VAT: Spain's 21%, which
// every buyer in the EU pays while CircleSfera's sales to other EU
// countries stay under the small-seller threshold. A buyer outside the EU
// pays none, so pays less than shown.
export const VAT_RATE_PERCENT = 21;

// A price before VAT with the VAT added, rounded to the cent, as the
// payment provider charges it. Consumers are shown this final price.
export function withVat(cents: number): number {
  return cents + Math.round((cents * VAT_RATE_PERCENT) / 100);
}
