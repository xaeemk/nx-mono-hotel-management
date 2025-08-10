import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import * as cron from 'node-cron';
import { createLogger } from '../../../libs/shared/utils';
import { PricingController } from './controllers/pricing.controller';
import { PricingService } from './services/pricing.service';
import { PricingRuleService } from './services/pricing-rule.service';
import { KafkaConsumerService } from './services/kafka-consumer.service';
import { config } from './config/config';
import Redis from 'ioredis';
import { Queue } from 'bullmq';

const logger = createLogger('pricing-agent');
const app = express();

// Redis connection for BullMQ and caching
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

// Event queues
const pricingQueue = new Queue('pricing-events', { connection: redis });
const demandAnalysisQueue = new Queue('demand-analysis', { connection: redis });

// Initialize services
const pricingRuleService = new PricingRuleService(redis, logger);
const pricingService = new PricingService(
  pricingRuleService,
  redis,
  pricingQueue,
  logger
);
const kafkaConsumer = new KafkaConsumerService(pricingService, logger);

// Initialize controllers
const pricingController = new PricingController(pricingService, logger);

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
    service: 'pricing-agent',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api/v1/pricing', pricingController.getRouter());

// Setup cron jobs for periodic pricing updates
cron.schedule('0 */6 * * *', async () => {
  logger.info('Running periodic demand analysis...');
  try {
    await demandAnalysisQueue.add('demand-analysis', {
      type: 'periodic',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to queue demand analysis', { error: error.message });
  }
});

// Dynamic pricing updates every hour
cron.schedule('0 * * * *', async () => {
  logger.info('Running dynamic pricing updates...');
  try {
    await pricingQueue.add('dynamic-pricing-update', {
      type: 'hourly',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to queue dynamic pricing update', {
      error: error.message,
    });
  }
});

// Seasonal pricing updates (daily at midnight)
cron.schedule('0 0 * * *', async () => {
  logger.info('Running seasonal pricing updates...');
  try {
    await pricingQueue.add('seasonal-pricing-update', {
      type: 'daily',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to queue seasonal pricing update', {
      error: error.message,
    });
  }
});

// Process pricing queue
pricingQueue.process('*', async (job) => {
  logger.info('Processing pricing job', { jobType: job.name, jobId: job.id });

  try {
    switch (job.name) {
      case 'dynamic-pricing-update':
        await pricingService.updateDynamicPricing();
        break;
      case 'seasonal-pricing-update':
        await pricingService.updateSeasonalPricing();
        break;
      default:
        logger.warn('Unknown job type', { jobType: job.name });
    }

    return { status: 'completed', timestamp: new Date().toISOString() };
  } catch (error) {
    logger.error('Pricing job failed', {
      jobType: job.name,
      jobId: job.id,
      error: error.message,
    });
    throw error;
  }
});

// Process demand analysis queue
demandAnalysisQueue.process('*', async (job) => {
  logger.info('Processing demand analysis job', {
    jobType: job.name,
    jobId: job.id,
  });

  try {
    await pricingService.analyzeDemandPatterns();
    return { status: 'completed', timestamp: new Date().toISOString() };
  } catch (error) {
    logger.error('Demand analysis job failed', {
      jobType: job.name,
      jobId: job.id,
      error: error.message,
    });
    throw error;
  }
});

// Start server
const PORT = config.service.port || 3010;

async function startServer() {
  try {
    // Initialize Kafka consumer for real-time events
    await kafkaConsumer.start();

    app.listen(PORT, () => {
      logger.info(`Pricing Agent started on port ${PORT}`);
      logger.info('Cron jobs scheduled for dynamic pricing updates');
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await pricingQueue.close();
  await demandAnalysisQueue.close();
  await kafkaConsumer.stop();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await pricingQueue.close();
  await demandAnalysisQueue.close();
  await kafkaConsumer.stop();
  await redis.quit();
  process.exit(0);
});

startServer();

export default app;
