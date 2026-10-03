import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { parseCspReports } from './csp-report.util.js';

// Receives Content-Security-Policy violation reports from browsers. Browsers
// send them without cookies or a CSRF token, so the route is excluded from
// CSRF in main.ts; it only writes a sanitized log line and never reads or
// changes data.
@Controller('security')
export class CspReportController {
  private readonly logger = new Logger('CspReport');

  @Post('csp-report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    short: { limit: 10, ttl: 1000 },
    medium: { limit: 60, ttl: 60000 },
  })
  receive(@Body() body: unknown): void {
    for (const v of parseCspReports(body)) {
      this.logger.warn(
        `CSP violation (${v.disposition}): ${v.directive} blocked ${v.blocked} on ${v.page}`,
      );
    }
  }
}
