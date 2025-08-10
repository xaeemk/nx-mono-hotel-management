import {
  getEnvVar,
  getEnvVarAsNumber,
  getEnvVarAsBoolean,
} from '../../../../libs/shared/utils';

export const config = {
  service: {
    name: 'payment-service',
    port: getEnvVarAsNumber('PAYMENT_SERVICE_PORT', 3001),
    version: '1.0.0',
    environment: getEnvVar('NODE_ENV', 'development'),
  },
  database: {
    host: getEnvVar('DB_HOST', 'localhost'),
    port: getEnvVarAsNumber('DB_PORT', 5432),
    database: getEnvVar('DB_NAME', 'payments'),
    username: getEnvVar('DB_USER', 'postgres'),
    password: getEnvVar('DB_PASSWORD'),
    ssl: getEnvVarAsBoolean('DB_SSL', false),
  },
  redis: {
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvVarAsNumber('REDIS_PORT', 6379),
    password: getEnvVar('REDIS_PASSWORD', undefined),
    db: getEnvVarAsNumber('REDIS_DB', 0),
  },
  paymentProviders: {
    bkash: {
      appKey: getEnvVar('BKASH_APP_KEY'),
      appSecret: getEnvVar('BKASH_APP_SECRET'),
      username: getEnvVar('BKASH_USERNAME'),
      password: getEnvVar('BKASH_PASSWORD'),
      baseUrl: getEnvVar(
        'BKASH_BASE_URL',
        'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
      ),
    },
    nagad: {
      merchantId: getEnvVar('NAGAD_MERCHANT_ID'),
      merchantPrivateKey: getEnvVar('NAGAD_MERCHANT_PRIVATE_KEY'),
      pgPublicKey: getEnvVar('NAGAD_PG_PUBLIC_KEY'),
      baseUrl: getEnvVar(
        'NAGAD_BASE_URL',
        'http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0'
      ),
    },
    sslcommerz: {
      storeId: getEnvVar('SSLCOMMERZ_STORE_ID'),
      storePassword: getEnvVar('SSLCOMMERZ_STORE_PASSWORD'),
      baseUrl: getEnvVar(
        'SSLCOMMERZ_BASE_URL',
        'https://sandbox.sslcommerz.com'
      ),
    },
  },
  security: {
    jwtSecret: getEnvVar('JWT_SECRET'),
    bcryptRounds: getEnvVarAsNumber('BCRYPT_ROUNDS', 12),
  },
  monitoring: {
    enableMetrics: getEnvVarAsBoolean('ENABLE_METRICS', true),
    enableTracing: getEnvVarAsBoolean('ENABLE_TRACING', true),
  },
};
