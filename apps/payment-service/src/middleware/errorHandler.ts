import { Request, Response, NextFunction } from 'express';
import {
  PaymentServiceError,
  isServiceError,
  createLogger,
} from '../../../../libs/shared/utils';

const logger = createLogger('payment-service-errors');

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Payment service error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
  });

  if (isServiceError(error)) {
    const serviceError = error as PaymentServiceError;
    return res.status(getHttpStatus(serviceError.code)).json({
      error: {
        code: serviceError.code,
        message: serviceError.message,
        details: serviceError.details,
      },
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.message,
      },
    });
  }

  // Handle JWT errors
  if (
    error.name === 'JsonWebTokenError' ||
    error.name === 'TokenExpiredError'
  ) {
    return res.status(401).json({
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Invalid or expired token',
        details: error.message,
      },
    });
  }

  // Default error response
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    },
  });
};

const getHttpStatus = (errorCode: string): number => {
  const statusMap: Record<string, number> = {
    PAYMENT_NOT_FOUND: 404,
    INVALID_PAYMENT_DATA: 400,
    PAYMENT_ALREADY_PROCESSED: 409,
    PROVIDER_ERROR: 502,
    INSUFFICIENT_BALANCE: 402,
    PAYMENT_EXPIRED: 410,
    UNAUTHORIZED_ACCESS: 401,
    FORBIDDEN_OPERATION: 403,
    RATE_LIMIT_EXCEEDED: 429,
    SERVICE_UNAVAILABLE: 503,
  };

  return statusMap[errorCode] || 500;
};
