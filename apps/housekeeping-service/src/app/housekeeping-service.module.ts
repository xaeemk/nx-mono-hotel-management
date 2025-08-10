import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { HousekeepingController } from './controllers/housekeeping.controller';
import { RoomStatusController } from './controllers/room-status.controller';
import { TaskController } from './controllers/task.controller';
import { HousekeepingService } from './services/housekeeping.service';
import { RoomStatusService } from './services/room-status.service';
import { TaskService } from './services/task.service';
import { StateMachineService } from './services/state-machine.service';
import { MqttService } from './services/mqtt.service';
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
    ScheduleModule.forRoot(),
    RedisModule,
    DatabaseModule,
    HealthModule,
  ],
  controllers: [HousekeepingController, RoomStatusController, TaskController],
  providers: [
    HousekeepingService,
    RoomStatusService,
    TaskService,
    StateMachineService,
    MqttService,
  ],
})
export class HousekeepingServiceModule {}
