import { describe, expect, it } from 'vitest';
import { carouselOrderAfterMove, remapByCarouselOrder } from './carouselOrder';

describe('carousel order', () => {
  it('moves an item one place later or earlier', () => {
    expect(carouselOrderAfterMove(3, 0, 1)).toEqual([1, 0, 2]);
    expect(carouselOrderAfterMove(3, 2, 1)).toEqual([0, 2, 1]);
  });

  it('moves an item across several places, shifting the ones in between', () => {
    expect(carouselOrderAfterMove(4, 0, 3)).toEqual([1, 2, 3, 0]);
    expect(carouselOrderAfterMove(4, 3, 0)).toEqual([3, 0, 1, 2]);
  });

  it('refuses a move that changes nothing or leaves the carousel', () => {
    expect(carouselOrderAfterMove(3, 1, 1)).toBeNull();
    expect(carouselOrderAfterMove(3, -1, 1)).toBeNull();
    expect(carouselOrderAfterMove(3, 0, 3)).toBeNull();
    expect(carouselOrderAfterMove(3, 0.5, 1)).toBeNull();
    expect(carouselOrderAfterMove(0, 0, 0)).toBeNull();
  });

  it('keeps each alt text with its photo after a move', () => {
    const altTexts = { 0: 'a beach', 2: 'a dog' };
    const order = carouselOrderAfterMove(3, 0, 2) as number[];

    // The beach was first and is now last; the dog moved up one place.
    expect(remapByCarouselOrder(altTexts, order)).toEqual({
      1: 'a dog',
      2: 'a beach',
    });
  });

  it('leaves positions without anything empty', () => {
    expect(remapByCarouselOrder({}, [1, 0])).toEqual({});
    expect(remapByCarouselOrder({ 1: ['ana'] }, [1, 0])).toEqual({
      0: ['ana'],
    });
  });
});
