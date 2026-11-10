/**
 * The shortest password a staff identity may set. Staff passwords are never
 * the password of a CircleSfera account, and they open the staff sites, so
 * they are longer than an account's.
 */
export const STAFF_PASSWORD_MIN_LENGTH = 12;

/** The longest password accepted anywhere a staff password is typed. */
export const STAFF_PASSWORD_MAX_LENGTH = 200;

/** The most passkeys one staff identity may keep. */
export const STAFF_PASSKEYS_MAX = 5;
