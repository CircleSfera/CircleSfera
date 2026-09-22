import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import '../src/auth/passkey/disable-experimental-webcrypto-pqc.js';

process.env.CSRF_SECRET =
  process.env.CSRF_SECRET || 'test-csrf-secret-key-32-characters-minimum!';
process.env.COOKIE_SECRET =
  process.env.COOKIE_SECRET || 'test-cookie-secret-key-32-chars!';

// Silence NestJS default logger methods during tests to prevent console/stderr pollution.
// This prevents mock error traces from displaying in the CI output.
vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {});
