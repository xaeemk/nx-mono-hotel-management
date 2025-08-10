import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import Redis from 'ioredis';
import * as crypto from 'crypto-js';
import { GenerateQrDto, QrResponseDto } from '../dto/qr.dto';

export interface QrData {
  reservationId: string;
  guestEmail: string;
  qrToken: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
  usedAt?: Date;
  customData?: Record<string, any>;
}

@Injectable()
export class QrService {
  private readonly redis: Redis;
  private readonly QR_TTL = 24 * 60 * 60; // 24 hours in seconds
  private readonly QR_SIZE = 256; // pixels
  private readonly ERROR_CORRECTION_LEVEL = 'M'; // M = ~15% error correction

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_QR_DB', 3),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });
  }

  async generateQrCode(generateQrDto: GenerateQrDto): Promise<QrResponseDto> {
    const {
      reservationId,
      guestEmail,
      expirationMinutes = 1440,
      customData,
    } = generateQrDto;

    // Generate unique QR token
    const qrToken = this.generateQrToken(reservationId);
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    // Create QR data object
    const qrData: QrData = {
      reservationId,
      guestEmail,
      qrToken,
      createdAt: new Date(),
      expiresAt,
      used: false,
      customData,
    };

    // Generate QR code content (URL or data)
    const qrContent = this.generateQrContent(qrToken, reservationId);

    try {
      // Generate QR code image as buffer
      const qrBuffer = await QRCode.toBuffer(qrContent, {
        type: 'png',
        width: this.QR_SIZE,
        errorCorrectionLevel: this
          .ERROR_CORRECTION_LEVEL as QRCode.QRCodeErrorCorrectionLevel,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        margin: 4,
      });

      // Store QR data in Redis
      await this.storeQrData(qrToken, qrData);

      // Store QR image in Redis (optional, for caching)
      await this.redis.setex(
        `qr:image:${qrToken}`,
        this.QR_TTL,
        qrBuffer.toString('base64')
      );

      const response: QrResponseDto = {
        success: true,
        message: 'QR code generated successfully',
        qrToken,
        qrImageUrl: `/api/v1/qr/image/${qrToken}`,
        qrImageBase64: qrBuffer.toString('base64'),
        expiresAt,
        reservationId,
        qrSize: this.QR_SIZE,
        errorCorrectionLevel: this.ERROR_CORRECTION_LEVEL,
      };

      return response;
    } catch (error) {
      throw new HttpException(
        `Failed to generate QR code: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getQrImage(qrToken: string): Promise<Buffer> {
    // Check if QR data exists and is valid
    const qrData = await this.getQrData(qrToken);
    if (!qrData) {
      throw new HttpException(
        'QR code not found or expired',
        HttpStatus.NOT_FOUND
      );
    }

    if (new Date() > qrData.expiresAt) {
      throw new HttpException('QR code has expired', HttpStatus.GONE);
    }

    // Try to get cached image first
    const cachedImage = await this.redis.get(`qr:image:${qrToken}`);
    if (cachedImage) {
      return Buffer.from(cachedImage, 'base64');
    }

    // Regenerate QR image if not cached
    const qrContent = this.generateQrContent(qrToken, qrData.reservationId);

    try {
      const qrBuffer = await QRCode.toBuffer(qrContent, {
        type: 'png',
        width: this.QR_SIZE,
        errorCorrectionLevel: this
          .ERROR_CORRECTION_LEVEL as QRCode.QRCodeErrorCorrectionLevel,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        margin: 4,
      });

      // Cache the regenerated image
      await this.redis.setex(
        `qr:image:${qrToken}`,
        Math.floor((qrData.expiresAt.getTime() - Date.now()) / 1000),
        qrBuffer.toString('base64')
      );

      return qrBuffer;
    } catch (error) {
      throw new HttpException(
        `Failed to generate QR image: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async validateQrCode(qrToken: string): Promise<{
    isValid: boolean;
    reservationId?: string;
    checkinToken?: string;
    message?: string;
  }> {
    const qrData = await this.getQrData(qrToken);

    if (!qrData) {
      return {
        isValid: false,
        message: 'QR code not found or expired',
      };
    }

    if (new Date() > qrData.expiresAt) {
      return {
        isValid: false,
        message: 'QR code has expired',
      };
    }

    if (qrData.used) {
      return {
        isValid: false,
        message: 'QR code has already been used',
      };
    }

    // Mark QR as used
    qrData.used = true;
    qrData.usedAt = new Date();
    await this.storeQrData(qrToken, qrData);

    // Generate temporary check-in token
    const checkinToken = this.generateCheckinToken(
      qrData.reservationId,
      qrToken
    );

    return {
      isValid: true,
      reservationId: qrData.reservationId,
      checkinToken,
      message: 'QR code validated successfully',
    };
  }

  async getQrStatus(qrToken: string): Promise<{
    isValid: boolean;
    expiresAt: Date;
    reservationId?: string;
    guestName?: string;
    roomNumber?: string;
    used: boolean;
  }> {
    const qrData = await this.getQrData(qrToken);

    if (!qrData) {
      throw new HttpException('QR code not found', HttpStatus.NOT_FOUND);
    }

    const isValid = new Date() <= qrData.expiresAt && !qrData.used;

    return {
      isValid,
      expiresAt: qrData.expiresAt,
      reservationId: qrData.reservationId,
      used: qrData.used,
      // TODO: Fetch guest name and room number from database if needed
    };
  }

  async refreshQrCode(reservationId: string): Promise<QrResponseDto> {
    // Find existing QR codes for this reservation
    const pattern = `qr:data:*`;
    const keys = await this.redis.keys(pattern);

    for (const key of keys) {
      const qrData = await this.getQrDataByKey(key);
      if (qrData && qrData.reservationId === reservationId) {
        // Invalidate old QR code
        await this.redis.del(key);
        await this.redis.del(`qr:image:${qrData.qrToken}`);
      }
    }

    // Generate new QR code
    return await this.generateQrCode({
      reservationId,
      guestEmail: '', // This should be fetched from database
      expirationMinutes: this.QR_TTL / 60,
    });
  }

  private generateQrToken(reservationId: string): string {
    const timestamp = Date.now();
    const random = crypto.lib.WordArray.random(16).toString();
    const hash = crypto
      .SHA256(`${reservationId}-${timestamp}-${random}`)
      .toString();
    return `qr_${reservationId}_${hash.substring(0, 16)}`;
  }

  private generateQrContent(qrToken: string, reservationId: string): string {
    // This could be a URL to your check-in app or encoded data
    const baseUrl = this.configService.get(
      'FRONTEND_URL',
      'http://localhost:3000'
    );
    return `${baseUrl}/checkin?token=${qrToken}&reservation=${reservationId}`;
  }

  private generateCheckinToken(reservationId: string, qrToken: string): string {
    const tokenData = {
      reservationId,
      qrToken,
      timestamp: Date.now(),
      type: 'qr_validation',
    };

    const token = crypto.AES.encrypt(
      JSON.stringify(tokenData),
      this.configService.get('CHECKIN_SECRET', 'default-secret')
    ).toString();

    return token;
  }

  private async storeQrData(qrToken: string, qrData: QrData): Promise<void> {
    const key = `qr:data:${qrToken}`;
    const ttl = Math.floor((qrData.expiresAt.getTime() - Date.now()) / 1000);

    if (ttl > 0) {
      await this.redis.setex(key, ttl, JSON.stringify(qrData));
    }
  }

  private async getQrData(qrToken: string): Promise<QrData | null> {
    const key = `qr:data:${qrToken}`;
    return await this.getQrDataByKey(key);
  }

  private async getQrDataByKey(key: string): Promise<QrData | null> {
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      const qrData = JSON.parse(data) as QrData;
      qrData.createdAt = new Date(qrData.createdAt);
      qrData.expiresAt = new Date(qrData.expiresAt);
      if (qrData.usedAt) {
        qrData.usedAt = new Date(qrData.usedAt);
      }
      return qrData;
    } catch (error) {
      console.error('Failed to parse QR data:', error);
      return null;
    }
  }
}
