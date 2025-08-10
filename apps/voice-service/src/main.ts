import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { VoiceServiceModule } from './app/voice-service.module';
import { environment } from './environments/environment';

async function bootstrap() {
  const app = await NestFactory.create(VoiceServiceModule);

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
    .setTitle('Voice Service API')
    .setDescription(
      'Hotel Voice Assistant API with Twilio integration, Whisper STT, and OpenAI Intent Router'
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('voice', 'Voice call handling and processing')
    .addTag('twilio', 'Twilio webhook endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  const port = environment.port || 3006;
  await app.listen(port, '0.0.0.0');

  Logger.log(
    `🎙️  Voice Service is running on: http://localhost:${port}/api/v1`,
    'Bootstrap'
  );
  Logger.log(
    `📚 Swagger docs available at: http://localhost:${port}/api/docs`,
    'Bootstrap'
  );
}

bootstrap().catch((err) => {
  Logger.error('Failed to start Voice Service', err);
  process.exit(1);
});
