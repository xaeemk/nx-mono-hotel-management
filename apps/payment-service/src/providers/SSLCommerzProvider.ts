import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import {
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

export interface SSLCommerzConfig {
  storeId: string;
  storePassword: string;
  baseUrl: string;
}

export class SSLCommerzProvider {
  private readonly logger = createLogger('sslcommerz-provider');

  constructor(private readonly config: SSLCommerzConfig) {}

  async initiatePayment(
    request: InitiatePaymentRequest
  ): Promise<InitiatePaymentResponse> {
    try {
      const transactionId = generateTransactionId();

      const paymentData = {
        store_id: this.config.storeId,
        store_passwd: this.config.storePassword,
        total_amount: request.amount.toString(),
        currency: request.currency,
        tran_id: transactionId,
        success_url: `${process.env.BASE_URL}/api/v1/payments/webhook/sslcommerz/success`,
        fail_url: `${process.env.BASE_URL}/api/v1/payments/webhook/sslcommerz/fail`,
        cancel_url: `${process.env.BASE_URL}/api/v1/payments/webhook/sslcommerz/cancel`,
        ipn_url: `${process.env.BASE_URL}/api/v1/payments/webhook/sslcommerz/ipn`,
        cus_name: 'Customer', // Would normally come from customer data
        cus_email: request.customerEmail || 'customer@example.com',
        cus_add1: 'Customer Address',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: request.customerPhone,
        ship_name: 'Customer',
        ship_add1: 'Customer Address',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: '1000',
        ship_country: 'Bangladesh',
        product_name: 'Service Booking',
        product_category: 'Service',
        product_profile: 'general',
        multi_card_name: 'mastercard,visacard,amexcard,internetbank,mobilebank',
        value_a: request.bookingId, // Custom field for booking ID
        value_b: '', // Additional custom field
        value_c: '', // Additional custom field
        value_d: '', // Additional custom field
      };

      const response = await retry(
        () =>
          axios.post(
            `${this.config.baseUrl}/gwprocess/v4/api.php`,
            paymentData,
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            }
          ),
        3,
        1000
      );

      this.logger.info('SSLCommerz payment initiated', {
        paymentId: request.bookingId,
        transactionId,
        amount: request.amount,
        status: response.data.status,
      });

      if (response.data.status === 'SUCCESS') {
        return {
          paymentId: request.bookingId,
          transactionId,
          status: PaymentStatus.PENDING,
          redirectUrl: response.data.GatewayPageURL,
        };
      } else {
        throw new PaymentServiceError(
          'PROVIDER_ERROR',
          response.data.failedreason || 'Payment initiation failed',
          response.data
        );
      }
    } catch (error) {
      this.logger.error('SSLCommerz payment initiation failed', {
        error: error.message,
        paymentId: request.bookingId,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to initiate SSLCommerz payment',
        error.response?.data || error.message
      );
    }
  }

  async confirmPayment(
    request: ConfirmPaymentRequest
  ): Promise<ConfirmPaymentResponse> {
    try {
      // Validate payment with SSLCommerz
      const validationResponse = await retry(
        () =>
          this.validatePayment(
            request.transactionId,
            request.providerData?.val_id
          ),
        3,
        1000
      );

      const isSuccess =
        validationResponse.data.status === 'VALID' ||
        validationResponse.data.status === 'VALIDATED';

      this.logger.info('SSLCommerz payment confirmation result', {
        paymentId: request.paymentId,
        transactionId: request.transactionId,
        success: isSuccess,
        validationStatus: validationResponse.data.status,
      });

      return {
        paymentId: request.paymentId,
        status: isSuccess ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
        amount: parseFloat(validationResponse.data.amount || '0'),
        errorMessage: isSuccess ? undefined : validationResponse.data.error,
      };
    } catch (error) {
      this.logger.error('SSLCommerz payment confirmation failed', {
        error: error.message,
        paymentId: request.paymentId,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to confirm SSLCommerz payment',
        error.response?.data || error.message
      );
    }
  }

  async getPaymentStatus(transactionId: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.config.baseUrl}/validator/api/validationserverAPI.php`,
        {
          store_id: this.config.storeId,
          store_passwd: this.config.storePassword,
          tran_id: transactionId,
          format: 'json',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error('SSLCommerz status check failed', {
        error: error.message,
        transactionId,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to get SSLCommerz payment status',
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
      const refundId = generateTransactionId();

      const response = await axios.post(
        `${this.config.baseUrl}/validator/api/merchantTransIDvalidationAPI.php`,
        {
          store_id: this.config.storeId,
          store_passwd: this.config.storePassword,
          refund_amount: amount.toString(),
          refund_remarks: reason,
          bank_tran_id: transactionId,
          refe_id: refundId,
          format: 'json',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error('SSLCommerz refund failed', {
        error: error.message,
        transactionId,
        amount,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to process SSLCommerz refund',
        error.response?.data || error.message
      );
    }
  }

  private async validatePayment(
    transactionId: string,
    valId?: string
  ): Promise<AxiosResponse> {
    const validationData: any = {
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    };

    if (valId) {
      validationData.val_id = valId;
    } else {
      validationData.tran_id = transactionId;
    }

    return axios.post(
      `${this.config.baseUrl}/validator/api/validationserverAPI.php`,
      validationData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
  }

  async handleWebhook(
    payload: any,
    webhookType: 'success' | 'fail' | 'cancel' | 'ipn'
  ): Promise<any> {
    try {
      this.logger.info('SSLCommerz webhook received', {
        type: webhookType,
        payload,
      });

      // Verify webhook data
      if (!this.verifyWebhookData(payload)) {
        throw new PaymentServiceError(
          'WEBHOOK_ERROR',
          'Invalid webhook data',
          payload
        );
      }

      let status: PaymentStatus;
      switch (webhookType) {
        case 'success':
          status = PaymentStatus.COMPLETED;
          break;
        case 'fail':
          status = PaymentStatus.FAILED;
          break;
        case 'cancel':
          status = PaymentStatus.CANCELLED;
          break;
        case 'ipn':
          status = this.mapSSLCommerzStatus(payload.status);
          break;
        default:
          status = PaymentStatus.FAILED;
      }

      return {
        paymentId: payload.value_a, // Booking ID stored in custom field
        status,
        transactionId: payload.tran_id,
        amount: parseFloat(payload.amount || '0'),
        metadata: payload,
      };
    } catch (error) {
      this.logger.error('SSLCommerz webhook processing failed', {
        error: error.message,
        type: webhookType,
        payload,
      });

      throw new PaymentServiceError(
        'WEBHOOK_ERROR',
        'Failed to process SSLCommerz webhook',
        error.message
      );
    }
  }

  private verifyWebhookData(payload: any): boolean {
    // Verify that the webhook contains required fields
    const requiredFields = ['store_id', 'tran_id', 'amount', 'status'];

    for (const field of requiredFields) {
      if (!payload[field]) {
        return false;
      }
    }

    // Verify store ID matches
    if (payload.store_id !== this.config.storeId) {
      return false;
    }

    // Additional verification can be added here
    // For example, you might want to verify a signature or hash

    return true;
  }

  private mapSSLCommerzStatus(status: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      VALID: PaymentStatus.COMPLETED,
      VALIDATED: PaymentStatus.COMPLETED,
      INVALID: PaymentStatus.FAILED,
      FAILED: PaymentStatus.FAILED,
      CANCELLED: PaymentStatus.CANCELLED,
      UNATTEMPTED: PaymentStatus.PENDING,
    };

    return statusMap[status] || PaymentStatus.FAILED;
  }
}
