// A staff identity signs in with a password of its own, set from the link it
// is sent, and never with the password of a CircleSfera account. A new
// identity stores this value until it sets one; it matches no password.
export const UNUSED_STAFF_PASSWORD_HASH =
  '$2b$10$AdminPanel.ResetRequired.placeholderXXXXX';

// Whether the identity has set a password of its own: told by when it set it,
// never by the stored hash, since identities made before staff had their own
// may still hold an old staff hash that nobody uses.
export function hasOwnStaffPassword(admin: {
  passwordSetAt?: Date | null;
}): boolean {
  return !!admin.passwordSetAt;
}
