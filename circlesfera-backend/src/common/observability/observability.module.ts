import { Global, Module } from '@nestjs/common';
import { SocketModule } from '../../socket/socket.module.js';
import { OperationalMetricsService } from './operational-metrics.service.js';

@Global()
@Module({
  imports: [SocketModule],
  providers: [OperationalMetricsService],
  exports: [OperationalMetricsService],
})
export class ObservabilityModule {}
