/**
 * The order of a carousel after one item moves to another place: for each
 * new position, the old position that ends up there. `null` when the move
 * is not possible or changes nothing.
 */
export function carouselOrderAfterMove(
  length: number,
  from: number,
  to: number,
): number[] | null {
  const inRange = (index: number) =>
    Number.isInteger(index) && index >= 0 && index < length;
  if (from === to || !inRange(from) || !inRange(to)) return null;
  const order = Array.from({ length }, (_, index) => index);
  order.splice(to, 0, order.splice(from, 1)[0]);
  return order;
}

/**
 * Something kept by position (an alt text, the tags of a photo) in the new
 * order, so it stays with its item.
 */
export function remapByCarouselOrder<T>(
  byPosition: Record<number, T>,
  order: number[],
): Record<number, T> {
  const next: Record<number, T> = {};
  order.forEach((oldIndex, newIndex) => {
    if (oldIndex in byPosition) next[newIndex] = byPosition[oldIndex];
  });
  return next;
}
