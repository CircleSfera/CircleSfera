import { describe, expect, it } from 'vitest';
import { downsamplePeaks, seededFallbackPeaks } from './audioWaveform';

describe('downsamplePeaks', () => {
  it('returns barCount peaks normalized to ~1', () => {
    const samples = new Float32Array(1000);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = i % 50 === 0 ? 0.8 : 0.05;
    }
    const peaks = downsamplePeaks(samples, 10);
    expect(peaks).toHaveLength(10);
    expect(Math.max(...peaks)).toBeCloseTo(1, 5);
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0.08);
  });

  it('handles empty input', () => {
    const peaks = downsamplePeaks([], 8);
    expect(peaks).toHaveLength(8);
  });
});

describe('seededFallbackPeaks', () => {
  it('is deterministic for the same seed', () => {
    expect(seededFallbackPeaks('track-a', 16)).toEqual(
      seededFallbackPeaks('track-a', 16),
    );
  });

  it('differs across seeds', () => {
    expect(seededFallbackPeaks('a', 16)).not.toEqual(
      seededFallbackPeaks('b', 16),
    );
  });
});
