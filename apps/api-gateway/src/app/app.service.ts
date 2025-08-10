import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly startTime = Date.now();

  getHello(): { message: string; timestamp: string; version: string } {
    return {
      message: 'API Gateway is running!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  getHealth(): { status: string; timestamp: string; uptime: number } {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
    };
  }
}
