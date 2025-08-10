import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import * as cron from 'node-cron';
import { createLogger } from '../../../libs/shared/utils';
import { AnomalyDetectorController } from './controllers/anomaly-detector.controller';
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { MCPCommandService } from './services/mcp-command.service';
import { PatternAnalysisService } from './services/pattern-analysis.service';
import { GhostBookingDetectorService } from './services/ghost-booking-detector.service';
import { config } from './config/config';
import Redis from 'ioredis';
import { Queue } from 'bullmq';

const logger = createLogger('anomaly-detector');
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

// Analysis and action queues
const analysisQueue = new Queue('anomaly-analysis', { connection: redis });
const actionQueue = new Queue('anomaly-actions', { connection: redis });

// Initialize services
const patternAnalysisService = new PatternAnalysisService(redis, logger);
const mcpCommandService = new MCPCommandService(redis, actionQueue, logger);
const ghostBookingDetectorService = new GhostBookingDetectorService(
  // Note: This will need proper PrismaService injection
  null, // TODO: Initialize PrismaService
  redis,
  actionQueue,
  logger
);
const anomalyDetectionService = new AnomalyDetectionService(
  redis,
  patternAnalysisService,
  mcpCommandService,
  analysisQueue,
  logger
);

// Initialize controllers
const anomalyController = new AnomalyDetectorController(
  anomalyDetectionService,
  patternAnalysisService,
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
    service: 'anomaly-detector',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api/v1/anomaly', anomalyController.getRouter());

// Real-time anomaly detection (every 5 minutes)
cron.schedule('*/5 * * * *', async () => {
  logger.info('Running real-time anomaly detection...');

  try {
    await analysisQueue.add('real-time-analysis', {
      type: 'real-time',
      timestamp: new Date().toISOString(),
      windowMinutes: 15, // Analyze last 15 minutes
    });
  } catch (error) {
    logger.error('Failed to queue real-time anomaly analysis', {
      error: error.message,
    });
  }
});

// Pattern analysis (every 30 minutes)
cron.schedule('*/30 * * * *', async () => {
  logger.info('Running pattern analysis for anomaly detection...');

  try {
    await analysisQueue.add('pattern-analysis', {
      type: 'pattern-update',
      timestamp: new Date().toISOString(),
      windowHours: 24, // Analyze last 24 hours for patterns
    });
  } catch (error) {
    logger.error('Failed to queue pattern analysis', { error: error.message });
  }
});

// Comprehensive anomaly analysis (hourly)
cron.schedule('0 * * * *', async () => {
  logger.info('Running comprehensive anomaly analysis...');

  try {
    await analysisQueue.add('comprehensive-analysis', {
      type: 'comprehensive',
      timestamp: new Date().toISOString(),
      windowHours: 4, // Analyze last 4 hours comprehensively
    });
  } catch (error) {
    logger.error('Failed to queue comprehensive analysis', {
      error: error.message,
    });
  }
});

// Ghost booking detection (every 10 minutes)
cron.schedule('*/10 * * * *', async () => {
  logger.info('Running ghost booking detection...');

  try {
    await analysisQueue.add('ghost-booking-detection', {
      type: 'ghost-booking-detection',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to queue ghost booking detection', {
      error: error.message,
    });
  }
});

// Model retraining (daily at 2 AM)
cron.schedule('0 2 * * *', async () => {
  logger.info('Running anomaly detection model retraining...');

  try {
    await analysisQueue.add('model-retrain', {
      type: 'model-retrain',
      timestamp: new Date().toISOString(),
      windowDays: 30, // Retrain on last 30 days of data
    });
  } catch (error) {
    logger.error('Failed to queue model retraining', { error: error.message });
  }
});

// Process analysis queue
analysisQueue.process('*', async (job) => {
  logger.info('Processing anomaly analysis job', {
    jobType: job.name,
    jobId: job.id,
    analysisType: job.data.type,
  });

  try {
    let result;

    switch (job.name) {
      case 'real-time-analysis':
        result = await anomalyDetectionService.performRealTimeAnalysis(
          job.data.windowMinutes
        );
        break;

      case 'pattern-analysis':
        result = await patternAnalysisService.updatePatterns(
          job.data.windowHours
        );
        break;

      case 'comprehensive-analysis':
        result = await anomalyDetectionService.performComprehensiveAnalysis(
          job.data.windowHours
        );
        break;

      case 'model-retrain':
        result = await anomalyDetectionService.retrainModels(
          job.data.windowDays
        );
        break;

      case 'ghost-booking-detection':
        // TODO: Initialize PrismaService properly before using
        // result = await ghostBookingDetectorService.detectGhostBookings();
        result = { status: 'skipped', reason: 'PrismaService not initialized' };
        break;

      default:
        logger.warn('Unknown analysis job type', { jobType: job.name });
        return { status: 'skipped', reason: 'unknown job type' };
    }

    job.progress(100);

    logger.info('Anomaly analysis job completed', {
      jobType: job.name,
      jobId: job.id,
      result: result?.summary || 'completed',
    });

    return result;
  } catch (error) {
    logger.error('Anomaly analysis job failed', {
      jobType: job.name,
      jobId: job.id,
      error: error.message,
    });
    throw error;
  }
});

// Process action queue
actionQueue.process('*', async (job) => {
  logger.info('Processing anomaly action job', {
    jobType: job.name,
    jobId: job.id,
    actionType: job.data.type,
  });

  try {
    let result;

    // Handle ghost booking actions
    if (job.name === 'ghost-booking-action') {
      switch (job.data.type) {
        case 'auto_cancel':
          // TODO: Initialize PrismaService properly before using
          // result = await ghostBookingDetectorService.executeAutoCancel(
          //   job.data.reservationId,
          //   job.data.context.cancellationReason || 'Ghost booking detected'
          // );
          result = { success: false, reason: 'PrismaService not initialized' };
          break;
        default:
          result = await mcpCommandService.executeCommand(job.data);
      }
    } else {
      result = await mcpCommandService.executeCommand(job.data);
    }

    job.progress(100);

    logger.info('Anomaly action completed', {
      jobType: job.name,
      jobId: job.id,
      actionType: job.data.type,
      success: result.success,
    });

    return result;
  } catch (error) {
    logger.error('Anomaly action failed', {
      jobType: job.name,
      jobId: job.id,
      actionType: job.data.type,
      error: error.message,
    });
    throw error;
  }
});

// Initialize pattern baselines at startup
async function initializeBaselines() {
  try {
    logger.info('Initializing anomaly detection baselines...');

    // Initialize baseline patterns from historical data
    await patternAnalysisService.initializeBaselines();

    // Load or create anomaly detection models
    await anomalyDetectionService.initializeModels();

    logger.info('Anomaly detection baselines initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize baselines', { error: error.message });
    throw error;
  }
}

// Start server
const PORT = config.service.port || 3012;

async function startServer() {
  try {
    // Initialize baselines and models
    await initializeBaselines();

    app.listen(PORT, () => {
      logger.info(`Anomaly Detector started on port ${PORT}`);
      logger.info('Scheduled anomaly detection jobs:');
      logger.info('  Real-time analysis: Every 5 minutes');
      logger.info('  Pattern analysis: Every 30 minutes');
      logger.info('  Comprehensive analysis: Every hour');
      logger.info('  Ghost booking detection: Every 10 minutes');
      logger.info('  Model retraining: Daily at 2:00 AM');
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
    await analysisQueue.close();
    await actionQueue.close();
    await redis.quit();

    logger.info('Anomaly Detector shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');

  try {
    await analysisQueue.close();
    await actionQueue.close();
    await redis.quit();

    logger.info('Anomaly Detector shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
});

startServer();

export default app;
