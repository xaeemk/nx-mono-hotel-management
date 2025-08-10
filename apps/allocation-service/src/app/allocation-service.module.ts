import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AllocationController } from './controllers/allocation.controller';
import { AllocationService } from './services/allocation.service';
import { RedisModule } from './modules/redis.module';
import { DatabaseModule } from './modules/database.module';
import { HealthModule } from './modules/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    RedisModule,
    DatabaseModule,
    HealthModule,
  ],
  controllers: [AllocationController],
  providers: [AllocationService],
})
export class AllocationServiceModule {}
