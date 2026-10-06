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
