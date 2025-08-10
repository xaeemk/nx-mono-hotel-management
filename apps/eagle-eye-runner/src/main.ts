import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import * as cron from 'node-cron';
import { createLogger } from '../../../libs/shared/utils';
import { EagleEyeController } from './controllers/eagle-eye.controller';
import { SlotManagerService } from './services/slot-manager.service';
import { ImmutableLedgerService } from './services/immutable-ledger.service';
import { TaskExecutorService } from './services/task-executor.service';
import { config } from './config/config';
import Redis from 'ioredis';
import { Queue } from 'bullmq';

const logger = createLogger('eagle-eye-runner');
const app = express();

// Redis connection
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

// Task execution queue
const taskQueue = new Queue('eagle-eye-tasks', { connection: redis });

// Initialize services
const immutableLedger = new ImmutableLedgerService(redis, logger);
const taskExecutor = new TaskExecutorService(immutableLedger, logger);
const slotManager = new SlotManagerService(
  redis,
  immutableLedger,
  taskExecutor,
  taskQueue,
  logger
);

// Initialize controllers
const eagleEyeController = new EagleEyeController(
  slotManager,
  immutableLedger,
  logger
);

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
    service: 'eagle-eye-runner',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api/v1/eagle-eye', eagleEyeController.getRouter());

// Schedule the 4 daily slots (6:00, 12:00, 18:00, 00:00)
const SLOT_TIMES = [
  { hour: 6, minute: 0, slot: 1 as const }, // 6:00 AM
  { hour: 12, minute: 0, slot: 2 as const }, // 12:00 PM
  { hour: 18, minute: 0, slot: 3 as const }, // 6:00 PM
  { hour: 0, minute: 0, slot: 4 as const }, // 12:00 AM (midnight)
];

// Setup cron jobs for the 4 daily slots
SLOT_TIMES.forEach(({ hour, minute, slot }) => {
  const cronExpression = `${minute} ${hour} * * *`;

  cron.schedule(cronExpression, async () => {
    logger.info(
      `Executing Eagle-Eye slot ${slot} at ${hour}:${minute
        .toString()
        .padStart(2, '0')}`
    );

    try {
      await slotManager.executeSlot(slot);
      logger.info(`Eagle-Eye slot ${slot} execution completed`);
    } catch (error) {
      logger.error(`Eagle-Eye slot ${slot} execution failed`, {
        error: error.message,
        slot,
        time: `${hour}:${minute.toString().padStart(2, '0')}`,
      });
    }
  });

  logger.info(
    `Scheduled Eagle-Eye slot ${slot} for ${hour}:${minute
      .toString()
      .padStart(2, '0')}`
  );
});

// Process task queue
taskQueue.process('*', async (job) => {
  logger.info('Processing Eagle-Eye task', {
    jobType: job.name,
    jobId: job.id,
    slotId: job.data.slotId,
  });

  try {
    const result = await taskExecutor.executeTask(job.data);

    // Update job progress
    job.progress(100);

    logger.info('Eagle-Eye task completed', {
      jobType: job.name,
      jobId: job.id,
      slotId: job.data.slotId,
      executionTime: result.executionTime,
    });

    return result;
  } catch (error) {
    logger.error('Eagle-Eye task failed', {
      jobType: job.name,
      jobId: job.id,
      slotId: job.data.slotId,
      error: error.message,
    });
    throw error;
  }
});

// Daily ledger verification at 1:00 AM
cron.schedule('0 1 * * *', async () => {
  logger.info('Starting daily ledger verification...');

  try {
    const verificationResult = await immutableLedger.verifyLedgerIntegrity();

    if (verificationResult.isValid) {
      logger.info('Daily ledger verification completed successfully', {
        entriesVerified: verificationResult.entriesVerified,
        merkleRootValid: verificationResult.merkleRootValid,
      });
    } else {
      logger.error('Daily ledger verification failed!', {
        errors: verificationResult.errors,
        entriesVerified: verificationResult.entriesVerified,
      });

      // Alert on ledger integrity issues
      // In production, this would trigger alerts via notification service
    }
  } catch (error) {
    logger.error('Daily ledger verification error', { error: error.message });
  }
});

// Initialize slot scheduler at startup
async function initializeSlotScheduler() {
  try {
    logger.info('Initializing Eagle-Eye slot scheduler...');

    // Initialize daily slots if not already created
    await slotManager.initializeDailySlots();

    logger.info('Eagle-Eye slot scheduler initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize slot scheduler', {
      error: error.message,
    });
    throw error;
  }
}

// Start server
const PORT = config.service.port || 3011;

async function startServer() {
  try {
    // Initialize the slot scheduler
    await initializeSlotScheduler();

    app.listen(PORT, () => {
      logger.info(`Eagle-Eye Runner started on port ${PORT}`);
      logger.info('Daily slot schedule:');
      SLOT_TIMES.forEach(({ hour, minute, slot }) => {
        logger.info(
          `  Slot ${slot}: ${hour}:${minute.toString().padStart(2, '0')}`
        );
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  try {
    await taskQueue.close();
    await redis.quit();

    logger.info('Eagle-Eye Runner shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');

  try {
    await taskQueue.close();
    await redis.quit();

    logger.info('Eagle-Eye Runner shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
});

startServer();

export default app;
