import { randomUUID } from 'crypto';
import winston from 'winston';
import { BaseEvent, EventType, ServiceError } from '../types';

// Logger Configuration
export const createLogger = (serviceName: string) => {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(
        ({ timestamp, level, message, service, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            service: serviceName,
            message,
            ...meta,
          });
        }
      )
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
      }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
  });
};

// UUID Generation
export const generateId = (): string => {
  return randomUUID();
};

export const generateTransactionId = (): string => {
  return `TXN_${Date.now()}_${generateId().split('-')[0]}`;
};

export const generateCorrelationId = (): string => {
  return `CORR_${Date.now()}_${generateId().split('-')[0]}`;
};

// Event Creation Helpers
export const createEvent = <T extends BaseEvent>(
  type: EventType,
  source: string,
  data: any,
  version: string = '1.0'
): T => {
  return {
    id: generateId(),
    type,
    timestamp: new Date(),
    source,
    version,
    data,
  } as T;
};

// Validation Helpers
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone: string): boolean => {
  // Bangladesh phone number validation
  const phoneRegex = /^(\+88)?01[3-9]\d{8}$/;
  return phoneRegex.test(phone);
};

export const validateAmount = (amount: number): boolean => {
  return amount > 0 && amount <= 1000000; // Max 1M BDT
};

export const validateCurrency = (currency: string): boolean => {
  const supportedCurrencies = ['BDT', 'USD'];
  return supportedCurrencies.includes(currency);
};

// Error Handling Utilities
export const createServiceError = (
  code: string,
  message: string,
  details?: any
): ServiceError => {
  return {
    code,
    message,
    details,
    stack: new Error().stack,
  };
};

export const isServiceError = (error: any): error is ServiceError => {
  return (
    error && typeof error.code === 'string' && typeof error.message === 'string'
  );
};

// Date/Time Utilities
export const formatDate = (date: Date): string => {
  return date.toISOString();
};

export const parseDate = (dateString: string): Date => {
  return new Date(dateString);
};

export const addMinutes = (date: Date, minutes: number): Date => {
  return new Date(date.getTime() + minutes * 60000);
};

export const addHours = (date: Date, hours: number): Date => {
  return new Date(date.getTime() + hours * 3600000);
};

export const addDays = (date: Date, days: number): Date => {
  return new Date(date.getTime() + days * 86400000);
};

export const isDateInFuture = (date: Date): boolean => {
  return date.getTime() > Date.now();
};

export const isDateInPast = (date: Date): boolean => {
  return date.getTime() < Date.now();
};

// Pagination Utilities
export const calculateOffset = (page: number, limit: number): number => {
  return (page - 1) * limit;
};

export const calculateTotalPages = (total: number, limit: number): number => {
  return Math.ceil(total / limit);
};

// Crypto Utilities
export const generateSecureToken = (length: number = 32): string => {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('hex');
};

export const hashString = (input: string): string => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(input).digest('hex');
};

export const verifyHash = (input: string, hash: string): boolean => {
  return hashString(input) === hash;
};

// HTTP Utilities
export const buildQueryString = (params: Record<string, any>): string => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });
  return query.toString();
};

export const parseQueryString = (
  queryString: string
): Record<string, string> => {
  const params = new URLSearchParams(queryString);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
};

// Money/Currency Utilities
export const formatCurrency = (
  amount: number,
  currency: string = 'BDT'
): string => {
  const formatter = new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency === 'BDT' ? 'BDT' : 'USD',
    minimumFractionDigits: 2,
  });
  return formatter.format(amount);
};

export const roundToTwoDecimals = (amount: number): number => {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
};

// Retry Utilities
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const retry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      await sleep(delayMs * Math.pow(2, attempt)); // Exponential backoff
    }
  }

  throw lastError!;
};

// Template Processing
export const processTemplate = (
  template: string,
  data: Record<string, any>
): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || match;
  });
};

// Environment Utilities
export const getEnvVar = (name: string, defaultValue?: string): string => {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value || defaultValue!;
};

export const getEnvVarAsNumber = (
  name: string,
  defaultValue?: number
): number => {
  const value = process.env[name];
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value ? parseInt(value, 10) : defaultValue!;
};

export const getEnvVarAsBoolean = (
  name: string,
  defaultValue: boolean = false
): boolean => {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
};

// Array Utilities
export const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const unique = <T>(array: T[]): T[] => {
  return [...new Set(array)];
};

export const groupBy = <T>(array: T[], key: keyof T): Record<string, T[]> => {
  return array.reduce((groups, item) => {
    const group = String(item[key]);
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {} as Record<string, T[]>);
};

// Object Utilities
export const omit = <T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> => {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
};

export const pick = <T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
};

export const deepMerge = (target: any, source: any): any => {
  if (!source) return target;

  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
};

// Health Check Utilities
export const createHealthCheck = (serviceName: string) => {
  return {
    name: serviceName,
    version: process.env.npm_package_version || '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
  };
};

export default {
  createLogger,
  generateId,
  generateTransactionId,
  generateCorrelationId,
  createEvent,
  validateEmail,
  validatePhone,
  validateAmount,
  validateCurrency,
  createServiceError,
  isServiceError,
  formatDate,
  parseDate,
  addMinutes,
  addHours,
  addDays,
  isDateInFuture,
  isDateInPast,
  calculateOffset,
  calculateTotalPages,
  generateSecureToken,
  hashString,
  verifyHash,
  buildQueryString,
  parseQueryString,
  formatCurrency,
  roundToTwoDecimals,
  sleep,
  retry,
  processTemplate,
  getEnvVar,
  getEnvVarAsNumber,
  getEnvVarAsBoolean,
  chunk,
  unique,
  groupBy,
  omit,
  pick,
  deepMerge,
  createHealthCheck,
};
