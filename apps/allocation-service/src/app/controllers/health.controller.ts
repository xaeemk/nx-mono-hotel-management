import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get service health status' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  @HealthCheck()
  check() {
    return this.health.check([
      // Memory check - should use less than 512MB
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      // Memory check - should use less than 512MB RSS
      () => this.memory.checkRSS('memory_rss', 512 * 1024 * 1024),
      // Disk check - should have more than 1GB free space
      () =>
        this.disk.checkStorage('storage', {
          path: '/',
          thresholdPercent: 0.9,
        }),
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Get service readiness status' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  ready() {
    return { status: 'ready', timestamp: new Date() };
  }

  @Get('live')
  @ApiOperation({ summary: 'Get service liveness status' })
  @ApiResponse({ status: 200, description: 'Service is live' })
  live() {
    return { status: 'live', timestamp: new Date() };
  }
}
