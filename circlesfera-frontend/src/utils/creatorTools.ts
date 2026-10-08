/**
 * The accounts that have creator tools (the creator studio and its entries
 * in the navigation): creator and business accounts.
 */
export function hasCreatorTools(accountType: string | null | undefined) {
  return accountType === 'CREATOR' || accountType === 'BUSINESS';
}
