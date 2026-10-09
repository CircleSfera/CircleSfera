/**
 * What the server sent, as a list. Anything that is not a list counts as an
 * empty one, so a wrong answer shows an empty state instead of breaking the
 * screen that expected to walk it.
 */
export function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
