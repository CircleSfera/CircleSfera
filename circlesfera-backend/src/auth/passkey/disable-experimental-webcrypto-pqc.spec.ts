import { describe, expect, it } from 'vitest';
import { disableExperimentalWebCryptoPqcProbe } from './disable-experimental-webcrypto-pqc.js';

describe('disableExperimentalWebCryptoPqcProbe', () => {
  it('hides SubtleCrypto.supports so Node does not warn on ML-DSA probes', () => {
    const warnings: string[] = [];
    const onWarning = (warning: Error) => {
      warnings.push(warning.message);
    };
    process.on('warning', onWarning);

    disableExperimentalWebCryptoPqcProbe();

    const Subtle = globalThis.SubtleCrypto;
    const probed =
      typeof (Subtle as any)?.supports === 'function' &&
      (Subtle as any).supports('verify', 'ML-DSA-44');

    process.off('warning', onWarning);

    expect(typeof (Subtle as any)?.supports).not.toBe('function');
    expect(probed).toBe(false);
    expect(
      warnings.filter(
        (message) =>
          message.includes('supports Web Crypto API') ||
          message.includes('ML-DSA-44 Web Crypto API'),
      ),
    ).toEqual([]);
  });
});
