import { ServiceConfig, RedisConfig } from '../../../../libs/shared/types';

export interface EagleEyeRunnerConfig {
  service: ServiceConfig;
  redis: RedisConfig;
  slots: {
    dailySlotCount: 4;
    slotDurationMinutes: number;
    maxConcurrentTasks: number;
    taskTimeoutMs: number;
  };
  ledger: {
    retentionDays: number;
    verificationInterval: string;
    backupInterval: string;
    compressionEnabled: boolean;
  };
  tasks: {
    defaultPriority: number;
    maxRetries: number;
    retryDelayMs: number;
  };
}

export const config: EagleEyeRunnerConfig = {
  service: {
    port: parseInt(process.env.EAGLE_EYE_PORT || '3011', 10),
    name: 'eagle-eye-runner',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  slots: {
    dailySlotCount: 4,
    slotDurationMinutes: parseInt(
      process.env.SLOT_DURATION_MINUTES || '30',
      10
    ),
    maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || '5', 10),
    taskTimeoutMs: parseInt(process.env.TASK_TIMEOUT_MS || '300000', 10), // 5 minutes
  },
  ledger: {
    retentionDays: parseInt(process.env.LEDGER_RETENTION_DAYS || '365', 10),
    verificationInterval:
      process.env.LEDGER_VERIFICATION_INTERVAL || '0 1 * * *', // Daily at 1 AM
    backupInterval: process.env.LEDGER_BACKUP_INTERVAL || '0 3 * * 0', // Weekly at 3 AM on Sunday
    compressionEnabled: process.env.LEDGER_COMPRESSION_ENABLED === 'true',
  },
  tasks: {
    defaultPriority: parseInt(process.env.DEFAULT_TASK_PRIORITY || '5', 10),
    maxRetries: parseInt(process.env.MAX_TASK_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000', 10),
  },
};
