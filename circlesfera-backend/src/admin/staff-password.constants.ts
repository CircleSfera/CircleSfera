// A staff account signs in with the password of its CircleSfera account, never
// with one of its own. The column that used to hold that password is required,
// so new staff accounts store this value, which matches no password.
export const UNUSED_STAFF_PASSWORD_HASH =
  '$2b$10$AdminPanel.ResetRequired.placeholderXXXXX';
