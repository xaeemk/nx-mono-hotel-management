import { ServiceConfig, RedisConfig } from '../../../../libs/shared/types';

export interface PricingAgentConfig {
  service: ServiceConfig;
  redis: RedisConfig;
  kafka: {
    brokers: string[];
    groupId: string;
    topics: string[];
  };
  pricing: {
    baseCurrency: string;
    defaultRoomTypes: string[];
    demandWindowHours: number;
    maxPriceMultiplier: number;
    minPriceMultiplier: number;
    cacheExpirationMinutes: number;
  };
}

export const config: PricingAgentConfig = {
  service: {
    port: parseInt(process.env.PRICING_AGENT_PORT || '3010', 10),
    name: 'pricing-agent',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    groupId: process.env.KAFKA_GROUP_ID || 'pricing-agent-group',
    topics: [
      'booking-events',
      'payment-events',
      'demand-events',
      'occupancy-events',
    ],
  },
  pricing: {
    baseCurrency: process.env.BASE_CURRENCY || 'BDT',
    defaultRoomTypes: ['STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL'],
    demandWindowHours: parseInt(process.env.DEMAND_WINDOW_HOURS || '24', 10),
    maxPriceMultiplier: parseFloat(process.env.MAX_PRICE_MULTIPLIER || '3.0'),
    minPriceMultiplier: parseFloat(process.env.MIN_PRICE_MULTIPLIER || '0.5'),
    cacheExpirationMinutes: parseInt(
      process.env.CACHE_EXPIRATION_MINUTES || '30',
      10
    ),
  },
};
