import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CheckinController } from './controllers/checkin.controller';
import { QrController } from './controllers/qr.controller';
import { CheckinService } from './services/checkin.service';
import { QrService } from './services/qr.service';
import { OtpService } from './services/otp.service';
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
  controllers: [CheckinController, QrController],
  providers: [CheckinService, QrService, OtpService],
})
export class CheckinServiceModule {}
