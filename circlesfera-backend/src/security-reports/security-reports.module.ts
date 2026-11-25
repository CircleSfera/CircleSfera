import { Module } from '@nestjs/common';
import { CspReportController } from './csp-report.controller.js';
import { CspReportStore } from './csp-report.store.js';

@Module({
  controllers: [CspReportController],
  providers: [CspReportStore],
  exports: [CspReportStore],
})
export class SecurityReportsModule {}
