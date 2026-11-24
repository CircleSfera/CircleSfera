/**
 * The youngest a person may be to pay for anything on CircleSfera (Platform
 * Plans and promotions): 18, by the date of birth on the document verified
 * with the identity provider. The app itself is open from a younger age.
 */
export const PAYER_MIN_AGE = 18;

/**
 * A person's age in whole years on a day, from their date of birth. Dates of
 * birth are calendar dates kept at midnight UTC, so the age is counted in
 * UTC and never moves a day with the server's time zone.
 */
export function ageOn(dateOfBirth: Date, day: Date = new Date()): number {
  let age = day.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const months = day.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (
    months < 0 ||
    (months === 0 && day.getUTCDate() < dateOfBirth.getUTCDate())
  ) {
    age--;
  }
  return age;
}
