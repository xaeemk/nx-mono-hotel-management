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

export interface NagadConfig {
  merchantId: string;
  merchantPrivateKey: string;
  pgPublicKey: string;
  baseUrl: string;
}

export class NagadProvider {
  private readonly logger = createLogger('nagad-provider');

  constructor(private readonly config: NagadConfig) {}

  async initiatePayment(
    request: InitiatePaymentRequest
  ): Promise<InitiatePaymentResponse> {
    try {
      const transactionId = generateTransactionId();
      const orderId = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Step 1: Initialize payment
      const initResponse = await this.initializePayment(request, orderId);

      // Step 2: Complete payment initialization
      const completeResponse = await this.completePaymentInitialization(
        initResponse.data.sensitiveData,
        initResponse.data.signature,
        request,
        orderId
      );

      this.logger.info('Nagad payment initiated', {
        paymentId: request.bookingId,
        orderId,
        amount: request.amount,
      });

      return {
        paymentId: request.bookingId,
        transactionId: orderId,
        status: PaymentStatus.PENDING,
        redirectUrl: completeResponse.data.callBackUrl,
      };
    } catch (error) {
      this.logger.error('Nagad payment initiation failed', {
        error: error.message,
        paymentId: request.bookingId,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to initiate Nagad payment',
        error.response?.data || error.message
      );
    }
  }

  async confirmPayment(
    request: ConfirmPaymentRequest
  ): Promise<ConfirmPaymentResponse> {
    try {
      const verifyResponse = await retry(
        () => this.verifyPayment(request.transactionId),
        3,
        1000
      );

      const isSuccess = verifyResponse.data.status === 'Success';

      this.logger.info('Nagad payment confirmation result', {
        paymentId: request.paymentId,
        transactionId: request.transactionId,
        success: isSuccess,
      });

      return {
        paymentId: request.paymentId,
        status: isSuccess ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
        amount: parseFloat(verifyResponse.data.amount || '0'),
        errorMessage: isSuccess ? undefined : verifyResponse.data.message,
      };
    } catch (error) {
      this.logger.error('Nagad payment confirmation failed', {
        error: error.message,
        paymentId: request.paymentId,
      });

      throw new PaymentServiceError(
        'PROVIDER_ERROR',
        'Failed to confirm Nagad payment',
        error.response?.data || error.message
      );
    }
  }

  private async initializePayment(
    request: InitiatePaymentRequest,
    orderId: string
  ): Promise<AxiosResponse> {
    const dateTime = new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .substr(0, 14);

    const sensitiveData = {
      merchantId: this.config.merchantId,
      datetime: dateTime,
      orderId: orderId,
      challenge: this.generateRandomString(40),
    };

    const postData = {
      accountNumber: request.customerPhone,
      dateTime: dateTime,
      sensitiveData: this.encryptSensitiveData(JSON.stringify(sensitiveData)),
      signature: this.generateSignature(JSON.stringify(sensitiveData)),
    };

    return axios.post(
      `${this.config.baseUrl}/api/dfs/check-out/initialize/${this.config.merchantId}/${orderId}`,
      postData,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-KM-Api-Version': 'v-0.2.0',
          'X-KM-IP-V4': this.getClientIP(),
          'X-KM-Client-Type': 'PC_WEB',
        },
      }
    );
  }

  private async completePaymentInitialization(
    sensitiveData: string,
    signature: string,
    request: InitiatePaymentRequest,
    orderId: string
  ): Promise<AxiosResponse> {
    const dateTime = new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .substr(0, 14);

    const orderInfo = {
      orderId: orderId,
      amount: request.amount.toString(),
      currencyCode: '050', // BDT
      challenge: this.generateRandomString(40),
    };

    const postData = {
      dateTime: dateTime,
      sensitiveData: this.encryptSensitiveData(JSON.stringify(orderInfo)),
      signature: this.generateSignature(JSON.stringify(orderInfo)),
      merchantCallbackURL: `${process.env.BASE_URL}/api/v1/payments/webhook/nagad`,
    };

    return axios.post(
      `${this.config.baseUrl}/api/dfs/check-out/complete/${orderId}`,
      postData,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-KM-Api-Version': 'v-0.2.0',
          'X-KM-IP-V4': this.getClientIP(),
          'X-KM-Client-Type': 'PC_WEB',
        },
      }
    );
  }

  private async verifyPayment(orderId: string): Promise<AxiosResponse> {
    return axios.get(
      `${this.config.baseUrl}/api/dfs/verify/payment/${orderId}`,
      {
        headers: {
          'X-KM-Api-Version': 'v-0.2.0',
          'X-KM-IP-V4': this.getClientIP(),
          'X-KM-Client-Type': 'PC_WEB',
        },
      }
    );
  }

  async handleWebhook(payload: any): Promise<any> {
    try {
      this.logger.info('Nagad webhook received', { payload });

      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload)) {
        throw new PaymentServiceError(
          'WEBHOOK_ERROR',
          'Invalid webhook signature',
          payload
        );
      }

      return {
        paymentId: payload.order_id,
        status: this.mapNagadStatus(payload.status),
        transactionId: payload.payment_ref_id,
        amount: parseFloat(payload.amount || '0'),
        metadata: payload,
      };
    } catch (error) {
      this.logger.error('Nagad webhook processing failed', {
        error: error.message,
        payload,
      });

      throw new PaymentServiceError(
        'WEBHOOK_ERROR',
        'Failed to process Nagad webhook',
        error.message
      );
    }
  }

  private encryptSensitiveData(data: string): string {
    try {
      const publicKey = `-----BEGIN PUBLIC KEY-----\n${this.config.pgPublicKey}\n-----END PUBLIC KEY-----`;
      const buffer = Buffer.from(data, 'utf8');
      const encrypted = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        buffer
      );
      return encrypted.toString('base64');
    } catch (error) {
      throw new PaymentServiceError(
        'ENCRYPTION_ERROR',
        'Failed to encrypt sensitive data',
        error.message
      );
    }
  }

  private generateSignature(data: string): string {
    try {
      const privateKey = `-----BEGIN PRIVATE KEY-----\n${this.config.merchantPrivateKey}\n-----END PRIVATE KEY-----`;
      const sign = crypto.createSign('SHA256');
      sign.update(data);
      sign.end();
      return sign.sign(privateKey, 'base64');
    } catch (error) {
      throw new PaymentServiceError(
        'SIGNATURE_ERROR',
        'Failed to generate signature',
        error.message
      );
    }
  }

  private verifyWebhookSignature(payload: any): boolean {
    // Implement webhook signature verification logic
    // This depends on Nagad's webhook signature mechanism
    return true; // Placeholder - implement actual verification
  }

  private generateRandomString(length: number): string {
    return crypto
      .randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  private getClientIP(): string {
    // In a real implementation, this should get the actual client IP
    return '127.0.0.1';
  }

  private mapNagadStatus(status: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      Success: PaymentStatus.COMPLETED,
      Pending: PaymentStatus.PENDING,
      Failed: PaymentStatus.FAILED,
      Cancelled: PaymentStatus.CANCELLED,
      Expired: PaymentStatus.FAILED,
    };

    return statusMap[status] || PaymentStatus.FAILED;
  }
}
