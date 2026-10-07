import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CspReportController } from './csp-report.controller.js';
import { CspReportStore, cspReportRedisProvider } from './csp-report.store.js';

@Module({
  imports: [ConfigModule],
  controllers: [CspReportController],
  providers: [cspReportRedisProvider, CspReportStore],
})
export class SecurityReportsModule {}
