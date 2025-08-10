import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { createLogger } from '../../../libs/shared/utils';
import { PaymentController } from './controllers/PaymentController';
import { PaymentService } from './services/PaymentService';
import { BkashProvider } from './providers/BkashProvider';
import { NagadProvider } from './providers/NagadProvider';
import { SSLCommerzProvider } from './providers/SSLCommerzProvider';
import { config } from './config/config';
import { errorHandler } from './middleware/errorHandler';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

dotenv.config();

const logger = createLogger('payment-service');
const app = express();

// Redis connection for BullMQ
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

// Event queue
const eventQueue = new Queue('payment-events', { connection: redis });

// Initialize payment providers
const bkashProvider = new BkashProvider(config.paymentProviders.bkash);
const nagadProvider = new NagadProvider(config.paymentProviders.nagad);
const sslcommerzProvider = new SSLCommerzProvider(
  config.paymentProviders.sslcommerz
);

// Initialize services
const paymentService = new PaymentService({
  providers: {
    bkash: bkashProvider,
    nagad: nagadProvider,
    sslcommerz: sslcommerzProvider,
  },
  eventQueue,
  logger,
});

// Initialize controllers
const paymentController = new PaymentController(paymentService, logger);

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'payment-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Swagger documentation
const swaggerDocument = YAML.load(
  '../../../libs/shared/contracts/openapi.yaml'
);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API routes
app.use('/api/v1/payments', paymentController.getRouter());

// Error handling
app.use(errorHandler);

// Start server
const PORT = config.service.port || 3001;

app.listen(PORT, () => {
  logger.info(`Payment Service started on port ${PORT}`);
  logger.info(`Documentation available at http://localhost:${PORT}/docs`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await eventQueue.close();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await eventQueue.close();
  await redis.quit();
  process.exit(0);
});

export default app;
