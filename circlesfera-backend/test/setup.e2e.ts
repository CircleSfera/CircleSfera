import { Logger } from '@nestjs/common';
import { vi } from 'vitest';

// Silence NestJS chatty log levels to keep the e2e output readable.
// `error` is intentionally left untouched: in e2e runs it is only emitted by
// AllExceptionsFilter for genuinely unexpected failures, which is precisely the
// context needed to diagnose a failing run.
vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {});
