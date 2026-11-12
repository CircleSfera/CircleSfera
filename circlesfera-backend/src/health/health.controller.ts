import { Controller, Get, Inject } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  DiskHealthIndicator,
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';
import { LiveKitHealthIndicator } from './livekit-health.indicator.js';
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
    @Inject(LiveKitHealthIndicator) private liveKit: LiveKitHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiResponse({ status: 200, type: Object })
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
   * What a person uses, checked from outside the server: the database, the
   * cache, storage and the live service. The error tracker's one uptime check
   * watches this address. The container's own health check stays on the
   * address above, which leaves the live service out: a live service that is
   * down must not mark the API as broken, nor roll a deploy back.
   */
  @Get('services')
  @HealthCheck()
  @ApiResponse({ status: 200, type: Object })
  checkServices(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redis.pingCheck('redis'),
      () =>
        this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
      () => this.liveKit.pingCheck('live'),
    ]);
  }

  /**
   * Liveness probe: verifies the node process is alive and memory resources are healthy.
   * Does NOT check external dependencies to prevent cascading restart storms.
   */
  @Get('liveness')
  @HealthCheck()
  @ApiResponse({ status: 200, type: Object })
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
  @ApiResponse({ status: 200, type: Object })
  checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redis.pingCheck('redis'),
      () =>
        this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }
}
