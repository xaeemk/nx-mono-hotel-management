import { Queue } from 'bullmq';
import { Logger } from 'winston';
import {
  PaymentProvider,
  PaymentStatus,
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  ConfirmPaymentRequest,
  ConfirmPaymentResponse,
  PaymentRecord,
  PaymentEvent,
  EventType,
  PaymentServiceError,
  generateId,
  createEvent,
} from '../../../../libs/shared/utils';
import { BkashProvider } from '../providers/BkashProvider';
import { NagadProvider } from '../providers/NagadProvider';
import { SSLCommerzProvider } from '../providers/SSLCommerzProvider';

interface PaymentServiceConfig {
  providers: {
    bkash: BkashProvider;
    nagad: NagadProvider;
    sslcommerz: SSLCommerzProvider;
  };
  eventQueue: Queue;
  logger: Logger;
}

export class PaymentService {
  private payments: Map<string, PaymentRecord> = new Map();

  constructor(private readonly config: PaymentServiceConfig) {}

  async initiatePayment(
    request: InitiatePaymentRequest
  ): Promise<InitiatePaymentResponse> {
    try {
      this.config.logger.info('Initiating payment', {
        bookingId: request.bookingId,
        provider: request.provider,
        amount: request.amount,
      });

      // Validate request
      await this.validatePaymentRequest(request);

      // Get the appropriate provider
      const provider = this.getProvider(request.provider);

      // Store payment record
      const paymentRecord: PaymentRecord = {
        paymentId: request.bookingId,
        bookingId: request.bookingId,
        amount: request.amount,
        currency: request.currency,
        provider: request.provider,
        status: PaymentStatus.PENDING,
        transactionId: '',
        customerPhone: request.customerPhone,
        customerEmail: request.customerEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: request.metadata,
      };

      // Initiate payment with provider
      const response = await provider.initiatePayment(request);

      // Update payment record
      paymentRecord.transactionId = response.transactionId;
      paymentRecord.status = response.status;
      paymentRecord.updatedAt = new Date();

      // Store the payment record
      this.payments.set(paymentRecord.paymentId, paymentRecord);

      // Publish event
      await this.publishPaymentEvent(
        EventType.PAYMENT_INITIATED,
        paymentRecord
      );

      this.config.logger.info('Payment initiated successfully', {
        paymentId: response.paymentId,
        transactionId: response.transactionId,
      });

      return response;
    } catch (error) {
      this.config.logger.error('Payment initiation failed', {
        error: error.message,
        bookingId: request.bookingId,
      });

      throw error;
    }
  }

  async confirmPayment(
    request: ConfirmPaymentRequest
  ): Promise<ConfirmPaymentResponse> {
    try {
      this.config.logger.info('Confirming payment', {
        paymentId: request.paymentId,
        transactionId: request.transactionId,
      });

      // Get payment record
      const paymentRecord = this.payments.get(request.paymentId);
      if (!paymentRecord) {
        throw new PaymentServiceError(
          'PAYMENT_NOT_FOUND',
          `Payment not found: ${request.paymentId}`
        );
      }

      // Check if payment is already processed
      if (paymentRecord.status === PaymentStatus.COMPLETED) {
        throw new PaymentServiceError(
          'PAYMENT_ALREADY_PROCESSED',
          'Payment is already confirmed'
        );
      }

      // Get the appropriate provider
      const provider = this.getProvider(paymentRecord.provider);

      // Confirm payment with provider
      const response = await provider.confirmPayment(request);

      // Update payment record
      paymentRecord.status = response.status;
      paymentRecord.providerReference = request.providerReference;
      paymentRecord.updatedAt = new Date();

      // Store updated record
      this.payments.set(paymentRecord.paymentId, paymentRecord);

      // Publish event
      const eventType =
        response.status === PaymentStatus.COMPLETED
          ? EventType.PAYMENT_CONFIRMED
          : EventType.PAYMENT_FAILED;

      await this.publishPaymentEvent(eventType, paymentRecord);

      this.config.logger.info('Payment confirmation completed', {
        paymentId: response.paymentId,
        status: response.status,
      });

      return response;
    } catch (error) {
      this.config.logger.error('Payment confirmation failed', {
        error: error.message,
        paymentId: request.paymentId,
      });

      throw error;
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentRecord | null> {
    try {
      const paymentRecord = this.payments.get(paymentId);

      if (!paymentRecord) {
        return null;
      }

      // Get fresh status from provider if payment is still pending
      if (paymentRecord.status === PaymentStatus.PENDING) {
        const provider = this.getProvider(paymentRecord.provider);

        try {
          const providerStatus = await provider.getPaymentStatus(
            paymentRecord.transactionId
          );

          // Update local record if status changed
          if (
            providerStatus &&
            providerStatus.status !== paymentRecord.status
          ) {
            paymentRecord.status = this.mapProviderStatus(
              providerStatus.status
            );
            paymentRecord.updatedAt = new Date();
            this.payments.set(paymentId, paymentRecord);
          }
        } catch (error) {
          // Log error but don't fail the request
          this.config.logger.warn('Failed to get fresh status from provider', {
            error: error.message,
            paymentId,
          });
        }
      }

      return paymentRecord;
    } catch (error) {
      this.config.logger.error('Get payment status failed', {
        error: error.message,
        paymentId,
      });

      throw error;
    }
  }

  async handleWebhook(
    provider: PaymentProvider,
    payload: any,
    webhookType?: string
  ): Promise<void> {
    try {
      this.config.logger.info('Processing webhook', {
        provider,
        webhookType,
        payload,
      });

      const providerInstance = this.getProvider(provider);
      let webhookData: any;

      // Handle different provider webhook formats
      if (provider === PaymentProvider.BKASH) {
        webhookData = await (providerInstance as BkashProvider).handleWebhook(
          payload
        );
      } else if (provider === PaymentProvider.NAGAD) {
        webhookData = await (providerInstance as NagadProvider).handleWebhook(
          payload
        );
      } else if (provider === PaymentProvider.SSLCOMMERZ) {
        webhookData = await (
          providerInstance as SSLCommerzProvider
        ).handleWebhook(payload, webhookType as any);
      } else {
        throw new PaymentServiceError(
          'UNSUPPORTED_PROVIDER',
          `Unsupported provider: ${provider}`
        );
      }

      // Find payment record by booking ID or transaction ID
      const paymentRecord = this.findPaymentRecord(
        webhookData.paymentId,
        webhookData.transactionId
      );

      if (!paymentRecord) {
        this.config.logger.warn('Payment record not found for webhook', {
          paymentId: webhookData.paymentId,
          transactionId: webhookData.transactionId,
        });
        return;
      }

      // Update payment record
      const previousStatus = paymentRecord.status;
      paymentRecord.status = webhookData.status;
      paymentRecord.updatedAt = new Date();
      paymentRecord.metadata = {
        ...paymentRecord.metadata,
        webhookData: webhookData.metadata,
      };

      this.payments.set(paymentRecord.paymentId, paymentRecord);

      // Publish event if status changed
      if (previousStatus !== webhookData.status) {
        let eventType: EventType;

        switch (webhookData.status) {
          case PaymentStatus.COMPLETED:
            eventType = EventType.PAYMENT_CONFIRMED;
            break;
          case PaymentStatus.FAILED:
          case PaymentStatus.CANCELLED:
            eventType = EventType.PAYMENT_FAILED;
            break;
          default:
            return; // Don't publish event for other statuses
        }

        await this.publishPaymentEvent(eventType, paymentRecord);
      }

      this.config.logger.info('Webhook processed successfully', {
        paymentId: paymentRecord.paymentId,
        newStatus: webhookData.status,
      });
    } catch (error) {
      this.config.logger.error('Webhook processing failed', {
        error: error.message,
        provider,
        payload,
      });

      throw error;
    }
  }

  private async validatePaymentRequest(
    request: InitiatePaymentRequest
  ): Promise<void> {
    if (!request.bookingId) {
      throw new PaymentServiceError(
        'INVALID_PAYMENT_DATA',
        'Booking ID is required'
      );
    }

    if (!request.amount || request.amount <= 0) {
      throw new PaymentServiceError(
        'INVALID_PAYMENT_DATA',
        'Valid amount is required'
      );
    }

    if (!request.currency) {
      throw new PaymentServiceError(
        'INVALID_PAYMENT_DATA',
        'Currency is required'
      );
    }

    if (!request.provider) {
      throw new PaymentServiceError(
        'INVALID_PAYMENT_DATA',
        'Payment provider is required'
      );
    }

    if (!request.customerPhone) {
      throw new PaymentServiceError(
        'INVALID_PAYMENT_DATA',
        'Customer phone is required'
      );
    }

    // Check if payment already exists
    if (this.payments.has(request.bookingId)) {
      throw new PaymentServiceError(
        'PAYMENT_ALREADY_EXISTS',
        'Payment already exists for this booking'
      );
    }
  }

  private getProvider(
    provider: PaymentProvider
  ): BkashProvider | NagadProvider | SSLCommerzProvider {
    switch (provider) {
      case PaymentProvider.BKASH:
        return this.config.providers.bkash;
      case PaymentProvider.NAGAD:
        return this.config.providers.nagad;
      case PaymentProvider.SSLCOMMERZ:
        return this.config.providers.sslcommerz;
      default:
        throw new PaymentServiceError(
          'UNSUPPORTED_PROVIDER',
          `Unsupported payment provider: ${provider}`
        );
    }
  }

  private findPaymentRecord(
    paymentId?: string,
    transactionId?: string
  ): PaymentRecord | null {
    if (paymentId && this.payments.has(paymentId)) {
      return this.payments.get(paymentId)!;
    }

    if (transactionId) {
      for (const payment of this.payments.values()) {
        if (payment.transactionId === transactionId) {
          return payment;
        }
      }
    }

    return null;
  }

  private mapProviderStatus(providerStatus: string): PaymentStatus {
    // This is a generic mapper - each provider might need specific mapping
    const statusMap: Record<string, PaymentStatus> = {
      SUCCESS: PaymentStatus.COMPLETED,
      COMPLETED: PaymentStatus.COMPLETED,
      VALID: PaymentStatus.COMPLETED,
      VALIDATED: PaymentStatus.COMPLETED,
      PENDING: PaymentStatus.PENDING,
      PROCESSING: PaymentStatus.PROCESSING,
      FAILED: PaymentStatus.FAILED,
      INVALID: PaymentStatus.FAILED,
      CANCELLED: PaymentStatus.CANCELLED,
      EXPIRED: PaymentStatus.FAILED,
    };

    return statusMap[providerStatus.toUpperCase()] || PaymentStatus.FAILED;
  }

  private async publishPaymentEvent(
    type: EventType,
    paymentRecord: PaymentRecord
  ): Promise<void> {
    try {
      const event: PaymentEvent = createEvent<PaymentEvent>(
        type,
        'payment-service',
        {
          paymentId: paymentRecord.paymentId,
          bookingId: paymentRecord.bookingId,
          amount: paymentRecord.amount,
          currency: paymentRecord.currency,
          status: paymentRecord.status,
          provider: paymentRecord.provider,
        }
      );

      await this.config.eventQueue.add('payment-event', event, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      this.config.logger.info('Payment event published', {
        eventId: event.id,
        eventType: type,
        paymentId: paymentRecord.paymentId,
      });
    } catch (error) {
      this.config.logger.error('Failed to publish payment event', {
        error: error.message,
        eventType: type,
        paymentId: paymentRecord.paymentId,
      });
    }
  }
}
