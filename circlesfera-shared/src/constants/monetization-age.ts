/**
 * The youngest a person may be to charge for anything on CircleSfera (tips,
 * paid posts and stories, live gifts): 18, by the date of birth on the
 * document verified with the identity provider. The app itself is open from
 * a younger age.
 */
export const MONETIZATION_MIN_AGE = 18;

/** A person's age in whole years on a day, from their date of birth. */
export function ageOn(dateOfBirth: Date, day: Date = new Date()): number {
  let age = day.getFullYear() - dateOfBirth.getFullYear();
  const months = day.getMonth() - dateOfBirth.getMonth();
  if (months < 0 || (months === 0 && day.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}
