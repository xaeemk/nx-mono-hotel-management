import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Global()
@Module({
  providers: [
    {
      provide: 'PRISMA_CLIENT',
      useFactory: (configService: ConfigService) => {
        const prisma = new PrismaClient({
          datasources: {
            db: {
              url: configService.get('DATABASE_URL'),
            },
          },
          log: [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'info' },
            { emit: 'event', level: 'warn' },
          ],
          errorFormat: 'minimal',
        });

        // Connect to database
        prisma.$connect().catch((error) => {
          console.error('Failed to connect to database:', error);
          process.exit(1);
        });

        return prisma;
      },
      inject: [ConfigService],
    },
    PrismaClient,
  ],
  exports: ['PRISMA_CLIENT', PrismaClient],
})
export class DatabaseModule {}
