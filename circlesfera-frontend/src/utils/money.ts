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
