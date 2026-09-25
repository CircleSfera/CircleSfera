import { Controller, Get, Inject } from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthCheckService) private health: HealthCheckService,
    @Inject(PrismaHealthIndicator) private prismaHealth: PrismaHealthIndicator,
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(DiskHealthIndicator) private disk: DiskHealthIndicator,
    @Inject(MemoryHealthIndicator) private memory: MemoryHealthIndicator,
    @Inject(RedisHealthIndicator) private redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redis.pingCheck('redis'),
      () =>
        this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
      () => this.memory.checkHeap('memory_heap', 1024 * 1024 * 1024), // 1GB
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024), // 1GB
    ]);
  }

  /**
   * Liveness probe: verifies the node process is alive and memory resources are healthy.
   * Does NOT check external dependencies to prevent cascading restart storms.
   */
  @Get('liveness')
  @HealthCheck()
  checkLiveness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 1024 * 1024 * 1024), // 1GB
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024), // 1GB
    ]);
  }

  /**
   * Readiness probe: verifies external dependencies (Database, Redis, Storage) are available
   * and capable of receiving traffic.
   */
  @Get('readiness')
  @HealthCheck()
  checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redis.pingCheck('redis'),
      () =>
        this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }
}
