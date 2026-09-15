/**
 * @simplewebauthn/server v14 calls SubtleCrypto.supports('verify', 'ML-DSA-44')
 * while the module initializes. Node 24 marks both `supports()` and ML-DSA
 * experimental, so every process that imports passkeys prints:
 *
 *   ExperimentalWarning: The supports Web Crypto API method...
 *   ExperimentalWarning: The ML-DSA-44 Web Crypto API algorithm...
 *
 * CircleSfera does not ship post-quantum passkeys. Hide the experimental
 * feature-detect so SimpleWebAuthn treats PQC as unavailable (EdDSA / ES256 /
 * RS256 only) until Node stabilizes those APIs.
 */
export function disableExperimentalWebCryptoPqcProbe(): void {
  const Subtle = globalThis.SubtleCrypto;
  if (Subtle == null || typeof (Subtle as any).supports !== 'function') {
    return;
  }

  Object.defineProperty(Subtle, 'supports', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: undefined,
  });
}

disableExperimentalWebCryptoPqcProbe();
