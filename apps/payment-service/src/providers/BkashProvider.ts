import axios, { AxiosResponse } from 'axios';
import {
  PaymentProvider,
  PaymentStatus,
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  ConfirmPaymentRequest,
  ConfirmPaymentResponse,
  PaymentServiceError,
  createLogger,
  generateTransactionId,
  retry,
} from '../../../../libs/shared/utils';

export interface BkashConfig {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  baseUrl: string;
}

export class BkashProvider {
  private readonly logger = createLogger('bkash-provider');
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(private readonly config: BkashConfig) {}

  async initiatePayment(
    request: InitiatePaymentRequest
  ): Promise<InitiatePaymentResponse> {
    try {
      const token = await this.getAccessToken();
      const transactionId = generateTransactionId();

      const response = await retry(
        () => this.createPayment(token, request, transactionId),
        3,
        1000
      );

      this.logger.info('bKash payment initiated', {
        paymentId: request.bookingId,
        transactionId,
        amount: request.amount,
      });

      return {
        paymentId: request.bookingId,
        transactionId,
        status: PaymentStatus.PENDING,
        redirectUrl: response.data.bkashURL,
      };
    } catch (error) {
      this.logger.error('bKash payment initiation failed', {
        error: error.message,
        paymentId: request.bookingId,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to initiate bKash payment',
        error.response?.data || error.message
      );
    }
  }

  async confirmPayment(
    request: ConfirmPaymentRequest
  ): Promise<ConfirmPaymentResponse> {
    try {
      const token = await this.getAccessToken();

      const response = await retry(
        () => this.executePayment(token, request.transactionId),
        3,
        1000
      );

      const isSuccess = response.data.statusCode === '0000';

      this.logger.info('bKash payment confirmation result', {
        paymentId: request.paymentId,
        transactionId: request.transactionId,
        success: isSuccess,
      });

      return {
        paymentId: request.paymentId,
        status: isSuccess ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
        amount: parseFloat(response.data.amount || '0'),
        errorMessage: isSuccess ? undefined : response.data.statusMessage,
      };
    } catch (error) {
      this.logger.error('bKash payment confirmation failed', {
        error: error.message,
        paymentId: request.paymentId,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to confirm bKash payment',
        error.response?.data || error.message
      );
    }
  }

  async getPaymentStatus(transactionId: string): Promise<any> {
    try {
      const token = await this.getAccessToken();

      const response = await axios.post(
        `${this.config.baseUrl}/checkout/payment/status`,
        { paymentID: transactionId },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: token,
            'X-APP-Key': this.config.appKey,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error('bKash status check failed', {
        error: error.message,
        transactionId,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to get bKash payment status',
        error.response?.data || error.message
      );
    }
  }

  async refundPayment(
    transactionId: string,
    amount: number,
    reason: string
  ): Promise<any> {
    try {
      const token = await this.getAccessToken();

      const response = await axios.post(
        `${this.config.baseUrl}/checkout/payment/refund`,
        {
          paymentID: transactionId,
          amount: amount.toString(),
          trxID: generateTransactionId(),
          sku: 'payment',
          reason,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: token,
            'X-APP-Key': this.config.appKey,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error('bKash refund failed', {
        error: error.message,
        transactionId,
        amount,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to process bKash refund',
        error.response?.data || error.message
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    if (
      this.accessToken &&
      this.tokenExpiresAt &&
      this.tokenExpiresAt > new Date()
    ) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        `${this.config.baseUrl}/checkout/token/grant`,
        {
          app_key: this.config.appKey,
          app_secret: this.config.appSecret,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            username: this.config.username,
            password: this.config.password,
          },
        }
      );

      this.accessToken = response.data.id_token;
      this.tokenExpiresAt = new Date(
        Date.now() + response.data.expires_in * 1000 - 60000
      ); // 1 minute buffer

      this.logger.info('bKash access token refreshed');

      return this.accessToken;
    } catch (error) {
      this.logger.error('bKash token generation failed', {
        error: error.message,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to get bKash access token',
        error.response?.data || error.message
      );
    }
  }

  private async createPayment(
    token: string,
    request: InitiatePaymentRequest,
    transactionId: string
  ): Promise<AxiosResponse> {
    return axios.post(
      `${this.config.baseUrl}/checkout/payment/create`,
      {
        mode: '0011',
        payerReference: request.customerPhone,
        callbackURL: `${process.env.BASE_URL}/api/v1/payments/webhook/bkash`,
        amount: request.amount.toString(),
        currency: request.currency,
        intent: 'sale',
        merchantInvoiceNumber: transactionId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'X-APP-Key': this.config.appKey,
        },
      }
    );
  }

  private async executePayment(
    token: string,
    paymentId: string
  ): Promise<AxiosResponse> {
    return axios.post(
      `${this.config.baseUrl}/checkout/payment/execute`,
      { paymentID: paymentId },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'X-APP-Key': this.config.appKey,
        },
      }
    );
  }

  async handleWebhook(payload: any): Promise<any> {
    try {
      this.logger.info('bKash webhook received', { payload });

      // Validate webhook signature if needed
      // Process webhook payload based on status

      return {
        paymentId: payload.paymentID,
        status: this.mapBkashStatus(payload.statusCode),
        transactionId: payload.trxID,
        amount: parseFloat(payload.amount || '0'),
        metadata: payload,
      };
    } catch (error) {
      this.logger.error('bKash webhook processing failed', {
        error: error.message,
        payload,
      });

      throw new PaymentServiceError(
        'WEBHOOK_ERROR',
        'Failed to process bKash webhook',
        error.message
      );
    }
  }

  private mapBkashStatus(statusCode: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      '0000': PaymentStatus.COMPLETED,
      '0001': PaymentStatus.PENDING,
      '0002': PaymentStatus.FAILED,
      '0011': PaymentStatus.CANCELLED,
    };

    return statusMap[statusCode] || PaymentStatus.FAILED;
  }
}
