/** Set or clear resolvedAt when a queue item reaches a terminal or reopen status. */
export function resolvedAtOnStatusChange(
  newStatus: string,
  existingResolvedAt: Date | null,
  terminalStatuses: readonly string[],
  reopenStatus: string,
): Date | null | undefined {
  if (terminalStatuses.includes(newStatus)) {
    return existingResolvedAt ?? new Date();
  }
  if (newStatus === reopenStatus) {
    return null;
  }
  return undefined;
}
