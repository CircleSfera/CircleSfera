// The side-effect import must stay above the re-export: ESM evaluates
// imports in source order, and SimpleWebAuthn probes ML-DSA at load.
import './disable-experimental-webcrypto-pqc.js';

export {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
