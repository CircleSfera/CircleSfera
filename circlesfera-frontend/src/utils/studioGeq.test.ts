import { describe, expect, it } from 'vitest';
import { duotoneGeq, lightLeakGeq, vhsGeq } from './studioEffects';
import { shapeFilter } from './studioOverlay';

// The export's ffmpeg reads a pixel at a whole position between it and the
// next one unless told not to, and at the right edge that next one is the
// first of the row below: every geq reads the nearest pixel instead.
describe('the geq filters of the export', () => {
  it('read the nearest pixel', () => {
    for (const filter of [
      duotoneGeq(0.7),
      vhsGeq(1080, 0.7),
      lightLeakGeq(2, 0.7),
      shapeFilter('circle', 's0'),
    ]) {
      expect(filter).toMatch(/geq=.*:interpolation=nearest(\[|$)/);
    }
  });
});
