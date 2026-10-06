import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CspReportStore } from './csp-report.store.js';
import { parseCspReports } from './csp-report.util.js';

// Receives Content-Security-Policy violation reports from browsers. Browsers
// send them without cookies or a CSRF token, so the route is excluded from
// CSRF in main.ts; it writes a sanitized log line and counts the violation,
// and never reads or changes participant data.
@Controller('security')
export class CspReportController {
  private readonly logger = new Logger('CspReport');

  constructor(@Inject(CspReportStore) private readonly store: CspReportStore) {}

  @Post('csp-report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    short: { limit: 10, ttl: 1000 },
    medium: { limit: 60, ttl: 60000 },
  })
  async receive(@Body() body: unknown): Promise<void> {
    const violations = parseCspReports(body);
    for (const v of violations) {
      this.logger.warn(
        `CSP violation (${v.disposition}): ${v.directive} blocked ${v.blocked} on ${v.page}`,
      );
    }
    await this.store.record(violations);
  }
}
