import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bull';
import { RedisModule } from './modules/redis.module';
import { DatabaseModule } from './modules/database.module';
import { HealthModule } from './modules/health.module';
import { VoiceController } from './controllers/voice.controller';
import { TwilioController } from './controllers/twilio.controller';
import { HealthController } from './controllers/health.controller';
import { WhisperService } from './services/whisper.service';
import { IntentRouterService } from './services/intent-router.service';
import { TtsService } from './services/tts.service';
import { VoiceCallService } from './services/voice-call.service';
import { VoiceSessionService } from './services/voice-session.service';
import { MCPPipelineService } from './services/mcp-pipeline.service';
import { NotificationIntegrationService } from './services/notification-integration.service';
import { environment } from '../environments/environment';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    TerminusModule,
    BullModule.forRoot({
      redis: {
        host: environment.redis.host,
        port: environment.redis.port,
        db: environment.redis.voiceDb,
      },
    }),
    BullModule.registerQueue(
      { name: 'voice-processing' },
      { name: 'mcp-pipeline' },
      { name: 'tts-generation' }
    ),
    DatabaseModule,
    RedisModule,
    HealthModule,
  ],
  controllers: [VoiceController, TwilioController, HealthController],
  providers: [
    WhisperService,
    IntentRouterService,
    TtsService,
    VoiceCallService,
    VoiceSessionService,
    MCPPipelineService,
    NotificationIntegrationService,
  ],
})
export class VoiceServiceModule {}
