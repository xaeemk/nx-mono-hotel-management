import { ServiceConfig, RedisConfig } from '../../../../libs/shared/types';

export interface AnomalyDetectorConfig {
  service: ServiceConfig;
  redis: RedisConfig;
  detection: {
    zScoreThreshold: number;
    isolationForestContamination: number;
    velocityThresholdMinutes: number;
    patternBreakThreshold: number;
    minimumDataPoints: number;
    maxAnomaliesPerHour: number;
  };
  actions: {
    autoLockRooms: boolean;
    autoFreezeAccounts: boolean;
    alertThresholds: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
  };
  mcp: {
    hubEndpoint: string;
    apiKey: string;
    maxRetries: number;
    timeoutMs: number;
  };
}

export const config: AnomalyDetectorConfig = {
  service: {
    port: parseInt(process.env.ANOMALY_DETECTOR_PORT || '3012', 10),
    name: 'anomaly-detector',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  detection: {
    zScoreThreshold: parseFloat(process.env.Z_SCORE_THRESHOLD || '3.0'),
    isolationForestContamination: parseFloat(
      process.env.ISOLATION_FOREST_CONTAMINATION || '0.1'
    ),
    velocityThresholdMinutes: parseInt(
      process.env.VELOCITY_THRESHOLD_MINUTES || '5',
      10
    ),
    patternBreakThreshold: parseFloat(
      process.env.PATTERN_BREAK_THRESHOLD || '0.8'
    ),
    minimumDataPoints: parseInt(process.env.MIN_DATA_POINTS || '50', 10),
    maxAnomaliesPerHour: parseInt(
      process.env.MAX_ANOMALIES_PER_HOUR || '10',
      10
    ),
  },
  actions: {
    autoLockRooms: process.env.AUTO_LOCK_ROOMS === 'true',
    autoFreezeAccounts: process.env.AUTO_FREEZE_ACCOUNTS === 'true',
    alertThresholds: {
      low: parseFloat(process.env.ALERT_THRESHOLD_LOW || '0.6'),
      medium: parseFloat(process.env.ALERT_THRESHOLD_MEDIUM || '0.75'),
      high: parseFloat(process.env.ALERT_THRESHOLD_HIGH || '0.85'),
      critical: parseFloat(process.env.ALERT_THRESHOLD_CRITICAL || '0.95'),
    },
  },
  mcp: {
    hubEndpoint:
      process.env.MCP_HUB_ENDPOINT || 'http://mcp-orchestration-hub:8080',
    apiKey: process.env.MCP_API_KEY || 'default-api-key',
    maxRetries: parseInt(process.env.MCP_MAX_RETRIES || '3', 10),
    timeoutMs: parseInt(process.env.MCP_TIMEOUT_MS || '30000', 10),
  },
};
