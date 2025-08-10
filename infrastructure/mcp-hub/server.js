const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const pino = require('pino');
const pinoLoki = require('pino-loki');
const promClient = require('prom-client');
const { initTracer } = require('jaeger-client');
const Bull = require('bull');
const Redis = require('ioredis');
const { Pool } = require('pg');

// Initialize logger with Loki transport
const logger = pino({
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        level: 'info',
        options: {
          colorize: true,
        },
      },
      {
        target: 'pino-loki',
        level: 'info',
        options: {
          batching: true,
          interval: 5,
          host: process.env.LOKI_ENDPOINT || 'http://loki:3100',
        },
      },
    ],
  },
});

// Initialize Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
});

const orchestrationTasksTotal = new promClient.Counter({
  name: 'orchestration_tasks_total',
  help: 'Total number of orchestration tasks processed',
  labelNames: ['status', 'type'],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(orchestrationTasksTotal);

// Initialize Jaeger tracing
const config = {
  serviceName: 'mcp-orchestration-hub',
  sampler: {
    type: 'const',
    param: 1,
  },
  reporter: {
    logSpans: true,
    agentHost: 'jaeger',
    agentPort: 6832,
  },
};

const options = {
  tags: {
    'mcp-orchestration-hub.version': '1.0.0',
  },
  metrics: promClient,
  logger: logger,
};

const tracer = initTracer(config, options);

// Initialize Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Initialize PostgreSQL connection
const pgPool = new Pool({
  connectionString:
    process.env.POSTGRES_URL ||
    'postgresql://postgres:postgres@postgres:5432/nx_mono_repo',
});

// Initialize Bull queues
const orchestrationQueue = new Bull(
  'orchestration',
  process.env.REDIS_URL || 'redis://redis:6379'
);
const taskQueue = new Bull(
  'tasks',
  process.env.REDIS_URL || 'redis://redis:6379'
);

// Express app setup
const app = express();
const port = process.env.PORT || 8080;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(
  morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } })
);

// Middleware to track request metrics
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer({
    method: req.method,
    route: req.route?.path || req.path,
  });

  res.on('finish', () => {
    end({ status: res.statusCode });
  });

  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const span = tracer.startSpan('health_check');

  try {
    // Check Redis connection
    await redis.ping();

    // Check PostgreSQL connection
    await pgPool.query('SELECT 1');

    span.setTag('health.status', 'healthy');
    logger.info('Health check passed');

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: 'connected',
        postgres: 'connected',
        queues: 'operational',
      },
    });
  } catch (error) {
    span.setTag('health.status', 'unhealthy');
    span.setTag('error', true);
    span.log({ event: 'error', message: error.message });

    logger.error({ error: error.message }, 'Health check failed');

    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  } finally {
    span.finish();
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// MCP orchestration endpoints
app.post('/orchestrate', async (req, res) => {
  const span = tracer.startSpan('orchestrate_task');

  try {
    const { taskType, payload, priority = 'normal' } = req.body;

    if (!taskType || !payload) {
      return res
        .status(400)
        .json({ error: 'taskType and payload are required' });
    }

    // Add task to queue
    const job = await orchestrationQueue.add(
      taskType,
      {
        payload,
        priority,
        timestamp: new Date().toISOString(),
        traceId: span.context().toString(),
      },
      {
        priority: priority === 'high' ? 1 : priority === 'low' ? 10 : 5,
        attempts: 3,
        backoff: 'exponential',
        delay: 0,
      }
    );

    orchestrationTasksTotal.inc({ status: 'queued', type: taskType });

    span.setTag('task.type', taskType);
    span.setTag('task.id', job.id);
    span.setTag('task.priority', priority);

    logger.info(
      { taskType, jobId: job.id, priority },
      'Task queued for orchestration'
    );

    res.json({
      taskId: job.id,
      status: 'queued',
      taskType,
      priority,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    span.setTag('error', true);
    span.log({ event: 'error', message: error.message });

    orchestrationTasksTotal.inc({
      status: 'failed',
      type: req.body.taskType || 'unknown',
    });

    logger.error({ error: error.message }, 'Failed to orchestrate task');

    res.status(500).json({ error: 'Failed to orchestrate task' });
  } finally {
    span.finish();
  }
});

app.get('/tasks/:taskId', async (req, res) => {
  const span = tracer.startSpan('get_task_status');

  try {
    const { taskId } = req.params;
    const job = await orchestrationQueue.getJob(taskId);

    if (!job) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const state = await job.getState();

    span.setTag('task.id', taskId);
    span.setTag('task.state', state);

    res.json({
      taskId,
      status: state,
      data: job.data,
      progress: job.progress(),
      created: new Date(job.timestamp),
      processed: job.processedOn ? new Date(job.processedOn) : null,
      finished: job.finishedOn ? new Date(job.finishedOn) : null,
      result: job.returnvalue || null,
      error: job.failedReason || null,
    });
  } catch (error) {
    span.setTag('error', true);
    span.log({ event: 'error', message: error.message });

    logger.error({ error: error.message }, 'Failed to get task status');

    res.status(500).json({ error: 'Failed to get task status' });
  } finally {
    span.finish();
  }
});

// Queue processing
orchestrationQueue.process('*', async (job) => {
  const span = tracer.startSpan('process_orchestration_task');

  try {
    const { payload, priority, timestamp, traceId } = job.data;

    span.setTag('task.type', job.name);
    span.setTag('task.id', job.id);
    span.setTag('task.priority', priority);

    logger.info(
      { taskType: job.name, jobId: job.id },
      'Processing orchestration task'
    );

    // Simulate task processing (replace with actual orchestration logic)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 2000 + 1000)
    );

    // Update progress
    job.progress(50);

    // More processing...
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 1000 + 500)
    );

    job.progress(100);

    orchestrationTasksTotal.inc({ status: 'completed', type: job.name });

    logger.info(
      { taskType: job.name, jobId: job.id },
      'Orchestration task completed'
    );

    return {
      status: 'completed',
      result: 'Task processed successfully',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    span.setTag('error', true);
    span.log({ event: 'error', message: error.message });

    orchestrationTasksTotal.inc({ status: 'failed', type: job.name });

    logger.error(
      { error: error.message, jobId: job.id },
      'Orchestration task failed'
    );

    throw error;
  } finally {
    span.finish();
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  await orchestrationQueue.close();
  await taskQueue.close();
  await redis.disconnect();
  await pgPool.end();

  process.exit(0);
});

app.listen(port, '0.0.0.0', () => {
  logger.info({ port }, 'MCP Orchestration Hub started');
});

module.exports = app;
