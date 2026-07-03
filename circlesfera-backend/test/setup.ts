import { Logger } from '@nestjs/common';
import { vi } from 'vitest';

// Silence NestJS default logger methods during tests to prevent console/stderr pollution.
// This prevents mock error traces from displaying in the CI output.
vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {});
