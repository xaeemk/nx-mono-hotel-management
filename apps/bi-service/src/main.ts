import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { BIServiceModule } from './app/bi-service.module';

async function bootstrap() {
  const app = await NestFactory.create(BIServiceModule);

  // Security & Performance
  app.use(helmet());
  app.use(compression());
  app.use(cors());

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'api/v',
    defaultVersion: '1',
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Business Intelligence Service API')
    .setDescription(
      'Hotel BI & Analytics API with Daily Digest Emails, Cohort Analysis, ADR/RevPAR Dashboards, and Metabase Integration'
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('analytics', 'Business intelligence and analytics endpoints')
    .addTag('dashboards', 'Dashboard data and metrics')
    .addTag('reports', 'Report generation and delivery')
    .addTag('metabase', 'Metabase integration endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  const port = process.env.BI_SERVICE_PORT || 3007;
  await app.listen(port, '0.0.0.0');

  Logger.log(
    `📊 BI Service is running on: http://localhost:${port}/api/v1`,
    'Bootstrap'
  );
  Logger.log(
    `📚 Swagger docs available at: http://localhost:${port}/api/docs`,
    'Bootstrap'
  );
}

bootstrap().catch((err) => {
  Logger.error('Failed to start BI Service', err);
  process.exit(1);
});
