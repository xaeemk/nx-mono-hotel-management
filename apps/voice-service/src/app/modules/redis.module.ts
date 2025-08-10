import { Module, Global } from '@nestjs/common';
import { Redis } from 'ioredis';
import { environment } from '../../environments/environment';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const redis = new Redis({
          host: environment.redis.host,
          port: environment.redis.port,
          db: environment.redis.voiceDb,
          retryDelayOnFailover: 100,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
        });

        redis.on('connect', () => {
          console.log('Voice Service Redis connected');
        });

        redis.on('error', (err) => {
          console.error('Voice Service Redis error:', err);
        });

        return redis;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
