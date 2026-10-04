// Retention of personal data that has no product use after a while.
export const PLAINTEXT_IP_RETENTION_DAYS = 90;
// Warning and strike records are deleted this long after they expire,
// unless they still cause a ban or suspension in force.
export const STRIKE_RECORD_RETENTION_DAYS_AFTER_EXPIRY = 365;
// Read in-app notifications.
export const READ_NOTIFICATION_RETENTION_DAYS = 90;
// Closed support tickets, resolved appeals and the staff audit log.
export const CASE_RECORD_RETENTION_DAYS = 730;
// Failed data export requests (completed ones expire with their file).
export const FAILED_EXPORT_RETENTION_DAYS = 7;
