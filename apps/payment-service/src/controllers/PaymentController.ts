import { Request, Response, Router } from 'express';
import { Logger } from 'winston';
import Joi from 'joi';
import {
  PaymentProvider,
  InitiatePaymentRequest,
  ConfirmPaymentRequest,
  PaymentServiceError,
  validateEmail,
  validatePhone,
  validateAmount,
} from '../../../../libs/shared/utils';
import { PaymentService } from '../services/PaymentService';

export class PaymentController {
  private readonly router = Router();

  constructor(
    private readonly paymentService: PaymentService,
    private readonly logger: Logger
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post('/initiate', this.initiatePayment.bind(this));
    this.router.post('/:paymentId/confirm', this.confirmPayment.bind(this));
    this.router.get('/:paymentId', this.getPaymentStatus.bind(this));

    // Webhook endpoints
    this.router.post('/webhook/bkash', this.handleBkashWebhook.bind(this));
    this.router.post('/webhook/nagad', this.handleNagadWebhook.bind(this));
    this.router.post(
      '/webhook/sslcommerz/:type',
      this.handleSSLCommerzWebhook.bind(this)
    );
  }

  async initiatePayment(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = await this.validateInitiatePaymentRequest(req.body);

      const response = await this.paymentService.initiatePayment(validatedData);

      res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  async confirmPayment(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      const validatedData = await this.validateConfirmPaymentRequest({
        paymentId,
        ...req.body,
      });

      const response = await this.paymentService.confirmPayment(validatedData);

      res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  async getPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;

      if (!paymentId) {
        throw new PaymentServiceError(
          'INVALID_REQUEST',
          'Payment ID is required'
        );
      }

      const payment = await this.paymentService.getPaymentStatus(paymentId);

      if (!payment) {
        res.status(404).json({
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: 'Payment not found',
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          paymentId: payment.paymentId,
          bookingId: payment.bookingId,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          provider: payment.provider,
          transactionId: payment.transactionId,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      });
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  async handleBkashWebhook(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('bKash webhook received', { body: req.body });

      await this.paymentService.handleWebhook(PaymentProvider.BKASH, req.body);

      res.status(200).json({ success: true });
    } catch (error) {
      this.logger.error('bKash webhook processing failed', {
        error: error.message,
      });
      res
        .status(500)
        .json({ success: false, error: 'Webhook processing failed' });
    }
  }

  async handleNagadWebhook(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('Nagad webhook received', { body: req.body });

      await this.paymentService.handleWebhook(PaymentProvider.NAGAD, req.body);

      res.status(200).json({ success: true });
    } catch (error) {
      this.logger.error('Nagad webhook processing failed', {
        error: error.message,
      });
      res
        .status(500)
        .json({ success: false, error: 'Webhook processing failed' });
    }
  }

  async handleSSLCommerzWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { type } = req.params;
      const validTypes = ['success', 'fail', 'cancel', 'ipn'];

      if (!validTypes.includes(type)) {
        res.status(400).json({ success: false, error: 'Invalid webhook type' });
        return;
      }

      this.logger.info('SSLCommerz webhook received', {
        type,
        body: req.body,
      });

      await this.paymentService.handleWebhook(
        PaymentProvider.SSLCOMMERZ,
        req.body,
        type
      );

      res.status(200).json({ success: true });
    } catch (error) {
      this.logger.error('SSLCommerz webhook processing failed', {
        error: error.message,
      });
      res
        .status(500)
        .json({ success: false, error: 'Webhook processing failed' });
    }
  }

  private async validateInitiatePaymentRequest(
    data: any
  ): Promise<InitiatePaymentRequest> {
    const schema = Joi.object({
      bookingId: Joi.string().required().min(1).max(100),
      amount: Joi.number().positive().max(1000000).required(),
      currency: Joi.string().valid('BDT', 'USD').required(),
      provider: Joi.string()
        .valid(
          PaymentProvider.BKASH,
          PaymentProvider.NAGAD,
          PaymentProvider.SSLCOMMERZ
        )
        .required(),
      customerPhone: Joi.string()
        .required()
        .custom((value, helpers) => {
          if (!validatePhone(value)) {
            return helpers.error('any.invalid');
          }
          return value;
        }),
      customerEmail: Joi.string().email().optional(),
      metadata: Joi.object().optional(),
    });

    const { error, value } = schema.validate(data);

    if (error) {
      throw new PaymentServiceError(
        'VALIDATION_ERROR',
        error.details[0].message
      );
    }

    // Additional business validation
    if (!validateAmount(value.amount)) {
      throw new PaymentServiceError(
        'INVALID_AMOUNT',
        'Amount must be between 1 and 1,000,000'
      );
    }

    if (value.customerEmail && !validateEmail(value.customerEmail)) {
      throw new PaymentServiceError('INVALID_EMAIL', 'Invalid email format');
    }

    return value;
  }

  private async validateConfirmPaymentRequest(
    data: any
  ): Promise<ConfirmPaymentRequest> {
    const schema = Joi.object({
      paymentId: Joi.string().required(),
      transactionId: Joi.string().required(),
      providerReference: Joi.string().required(),
      providerData: Joi.object().optional(),
    });

    const { error, value } = schema.validate(data);

    if (error) {
      throw new PaymentServiceError(
        'VALIDATION_ERROR',
        error.details[0].message
      );
    }

    return value;
  }

  private handleError(error: any, req: Request, res: Response): void {
    this.logger.error('Payment controller error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      body: req.body,
    });

    if (error instanceof PaymentServiceError) {
      const statusCode = this.getHttpStatusFromErrorCode(error.code);
      res.status(statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
      return;
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }

  private getHttpStatusFromErrorCode(errorCode: string): number {
    const statusMap: Record<string, number> = {
      VALIDATION_ERROR: 400,
      INVALID_REQUEST: 400,
      INVALID_PAYMENT_DATA: 400,
      INVALID_AMOUNT: 400,
      INVALID_EMAIL: 400,
      PAYMENT_NOT_FOUND: 404,
      PAYMENT_ALREADY_EXISTS: 409,
      PAYMENT_ALREADY_PROCESSED: 409,
      PROVIDER_ERROR: 502,
      INSUFFICIENT_BALANCE: 402,
      PAYMENT_EXPIRED: 410,
      UNAUTHORIZED_ACCESS: 401,
      FORBIDDEN_OPERATION: 403,
      RATE_LIMIT_EXCEEDED: 429,
      SERVICE_UNAVAILABLE: 503,
      UNSUPPORTED_PROVIDER: 400,
    };

    return statusMap[errorCode] || 500;
  }

  getRouter(): Router {
    return this.router;
  }
}
