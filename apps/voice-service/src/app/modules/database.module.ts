import { Module, Global } from '@nestjs/common';
import { Pool } from 'pg';
import { environment } from '../../environments/environment';

export const DATABASE_POOL = 'DATABASE_POOL';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => {
        const pool = new Pool({
          connectionString: environment.database.url,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        });

        pool.on('connect', () => {
          console.log('Voice Service Database connected');
        });

        pool.on('error', (err) => {
          console.error('Voice Service Database error:', err);
        });

        return pool;
      },
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
