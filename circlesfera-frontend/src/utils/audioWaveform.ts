/** Downsample PCM samples to normalized peak bars (0–1). */
export function downsamplePeaks(
  samples: ArrayLike<number>,
  barCount: number,
): number[] {
  const count = Math.max(1, Math.floor(barCount));
  if (samples.length === 0) {
    return Array.from({ length: count }, () => 0.2);
  }

  const blockSize = samples.length / count;
  const peaks: number[] = [];
  let globalMax = 0;

  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * blockSize);
    const end = Math.min(samples.length, Math.floor((i + 1) * blockSize));
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j] ?? 0);
      if (abs > peak) peak = abs;
    }
    peaks.push(peak);
    if (peak > globalMax) globalMax = peak;
  }

  if (globalMax <= 0) {
    return peaks.map(() => 0.15);
  }

  // Soft floor so quiet sections still show a bar.
  return peaks.map((p) => Math.max(0.08, p / globalMax));
}

/** Deterministic placeholder when CORS / decode fails. */
export function seededFallbackPeaks(seed: string, barCount = 64): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const peaks: number[] = [];
  for (let i = 0; i < barCount; i++) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    const n = (hash >>> 0) / 0xffffffff;
    // Gentle envelope so it looks like a track, not noise.
    const envelope = 0.35 + 0.65 * Math.sin((i / barCount) * Math.PI);
    peaks.push(Math.max(0.1, Math.min(1, 0.25 + n * 0.75 * envelope)));
  }
  return peaks;
}

/**
 * Decode an audio URL into peak bars via Web Audio.
 * Falls back to seeded peaks on CORS / network / decode errors.
 */
export async function extractAudioPeaks(
  url: string,
  options?: { barCount?: number; seed?: string; signal?: AbortSignal },
): Promise<{ peaks: number[]; fromAudio: boolean }> {
  const barCount = options?.barCount ?? 64;
  const seed = options?.seed ?? url;

  try {
    const res = await fetch(url, {
      signal: options?.signal,
      mode: 'cors',
      credentials: 'omit',
    });
    if (!res.ok) {
      throw new Error(`waveform_fetch_${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioContextClass();
    try {
      const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const channel = buffer.getChannelData(0);
      return {
        peaks: downsamplePeaks(channel, barCount),
        fromAudio: true,
      };
    } finally {
      await ctx.close().catch(() => {});
    }
  } catch (err) {
    if (options?.signal?.aborted) {
      throw err;
    }
    return {
      peaks: seededFallbackPeaks(seed, barCount),
      fromAudio: false,
    };
  }
}
