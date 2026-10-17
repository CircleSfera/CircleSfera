// How long a decision can be appealed: six months from the day the person
// was told of it, also after a warning or strike has expired.
export const APPEAL_WINDOW_MONTHS = 6;

/** The last moment a decision taken at `decidedAt` can be appealed. */
export function appealDeadline(decidedAt: Date): Date {
  const deadline = new Date(decidedAt);
  const day = deadline.getUTCDate();
  deadline.setUTCMonth(deadline.getUTCMonth() + APPEAL_WINDOW_MONTHS);
  // 31 August plus six months is the end of February, not early March.
  if (deadline.getUTCDate() !== day) deadline.setUTCDate(0);
  return deadline;
}
