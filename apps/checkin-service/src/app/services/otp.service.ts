import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as speakeasy from 'speakeasy';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto-js';

export interface OtpData {
  reservationId: string;
  guestEmail: string;
  guestPhone?: string;
  otp: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  lastAttemptAt?: Date;
  verified: boolean;
  deliveryMethod: 'email' | 'sms' | 'both';
}

@Injectable()
export class OtpService {
  private readonly redis: Redis;
  private readonly emailTransporter: nodemailer.Transporter;
  private readonly OTP_TTL = 15 * 60; // 15 minutes in seconds
  private readonly MAX_ATTEMPTS = 5;
  private readonly OTP_LENGTH = 6;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_OTP_DB', 4),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    // Configure email transporter
    this.emailTransporter = nodemailer.createTransporter({
      host: this.configService.get('SMTP_HOST', 'localhost'),
      port: this.configService.get('SMTP_PORT', 587),
      secure: this.configService.get('SMTP_SECURE', false),
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  async generateOtp(
    reservationId: string,
    guestEmail: string,
    guestPhone?: string,
    deliveryMethod: 'email' | 'sms' | 'both' = 'both'
  ): Promise<{
    sent: boolean;
    expiresIn: number;
    deliveryMethod: string;
    message: string;
  }> {
    // Check if there's an existing valid OTP
    const existingOtp = await this.getOtpData(reservationId);
    if (existingOtp && !this.isOtpExpired(existingOtp)) {
      // Check rate limiting - don't allow new OTP generation too frequently
      const timeSinceCreation = Date.now() - existingOtp.createdAt.getTime();
      const minInterval = 60 * 1000; // 1 minute between OTP generations

      if (timeSinceCreation < minInterval) {
        throw new HttpException(
          `Please wait ${Math.ceil(
            (minInterval - timeSinceCreation) / 1000
          )} seconds before requesting a new OTP`,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    // Generate new 6-digit OTP
    const otp = this.generateSecureOtp();
    const expiresAt = new Date(Date.now() + this.OTP_TTL * 1000);

    // Create OTP data
    const otpData: OtpData = {
      reservationId,
      guestEmail,
      guestPhone,
      otp,
      createdAt: new Date(),
      expiresAt,
      attempts: 0,
      verified: false,
      deliveryMethod,
    };

    // Store OTP data in Redis
    await this.storeOtpData(reservationId, otpData);

    // Send OTP via selected delivery method(s)
    const deliveryResults = await this.sendOtp(otpData);

    return {
      sent: deliveryResults.success,
      expiresIn: this.OTP_TTL,
      deliveryMethod: deliveryMethod,
      message: deliveryResults.message,
    };
  }

  async validateOtp(reservationId: string, inputOtp: string): Promise<boolean> {
    const otpData = await this.getOtpData(reservationId);

    if (!otpData) {
      throw new HttpException(
        'No OTP found for this reservation',
        HttpStatus.NOT_FOUND
      );
    }

    if (this.isOtpExpired(otpData)) {
      throw new HttpException('OTP has expired', HttpStatus.BAD_REQUEST);
    }

    if (otpData.verified) {
      throw new HttpException(
        'OTP has already been used',
        HttpStatus.BAD_REQUEST
      );
    }

    if (otpData.attempts >= this.MAX_ATTEMPTS) {
      throw new HttpException(
        'Maximum OTP validation attempts exceeded',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Update attempt count
    otpData.attempts++;
    otpData.lastAttemptAt = new Date();

    // Validate OTP
    if (otpData.otp === inputOtp) {
      otpData.verified = true;
      await this.storeOtpData(reservationId, otpData);
      return true;
    } else {
      await this.storeOtpData(reservationId, otpData);

      if (otpData.attempts >= this.MAX_ATTEMPTS) {
        throw new HttpException(
          'Maximum OTP validation attempts exceeded',
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      return false;
    }
  }

  async resendOtp(reservationId: string): Promise<{
    sent: boolean;
    message: string;
    expiresIn: number;
  }> {
    const existingOtp = await this.getOtpData(reservationId);

    if (!existingOtp) {
      throw new HttpException('No OTP session found', HttpStatus.NOT_FOUND);
    }

    if (existingOtp.verified) {
      throw new HttpException(
        'OTP has already been verified',
        HttpStatus.BAD_REQUEST
      );
    }

    // Generate new OTP but keep the same session
    const newOtp = this.generateSecureOtp();
    const expiresAt = new Date(Date.now() + this.OTP_TTL * 1000);

    existingOtp.otp = newOtp;
    existingOtp.expiresAt = expiresAt;
    existingOtp.attempts = 0; // Reset attempt count
    existingOtp.createdAt = new Date();

    await this.storeOtpData(reservationId, existingOtp);

    const deliveryResults = await this.sendOtp(existingOtp);

    return {
      sent: deliveryResults.success,
      message: deliveryResults.message,
      expiresIn: this.OTP_TTL,
    };
  }

  async getOtpStatus(reservationId: string): Promise<{
    exists: boolean;
    expired: boolean;
    verified: boolean;
    attempts: number;
    maxAttempts: number;
    expiresAt?: Date;
    timeRemaining?: number;
  }> {
    const otpData = await this.getOtpData(reservationId);

    if (!otpData) {
      return {
        exists: false,
        expired: false,
        verified: false,
        attempts: 0,
        maxAttempts: this.MAX_ATTEMPTS,
      };
    }

    const expired = this.isOtpExpired(otpData);
    const timeRemaining = expired
      ? 0
      : Math.max(0, otpData.expiresAt.getTime() - Date.now());

    return {
      exists: true,
      expired,
      verified: otpData.verified,
      attempts: otpData.attempts,
      maxAttempts: this.MAX_ATTEMPTS,
      expiresAt: otpData.expiresAt,
      timeRemaining,
    };
  }

  private generateSecureOtp(): string {
    // Generate cryptographically secure random OTP
    const token = speakeasy.generateSecret({ length: 20 });
    const otp = speakeasy.totp({
      secret: token.base32,
      encoding: 'base32',
      digits: this.OTP_LENGTH,
      window: 0,
    });

    return otp;
  }

  private async sendOtp(otpData: OtpData): Promise<{
    success: boolean;
    message: string;
  }> {
    const results = [];

    // Send via email
    if (
      otpData.deliveryMethod === 'email' ||
      otpData.deliveryMethod === 'both'
    ) {
      try {
        await this.sendOtpEmail(otpData);
        results.push('email sent successfully');
      } catch (error) {
        console.error('Failed to send OTP email:', error);
        results.push('email failed');
      }
    }

    // Send via SMS (if phone number provided)
    if (
      (otpData.deliveryMethod === 'sms' || otpData.deliveryMethod === 'both') &&
      otpData.guestPhone
    ) {
      try {
        await this.sendOtpSms(otpData);
        results.push('SMS sent successfully');
      } catch (error) {
        console.error('Failed to send OTP SMS:', error);
        results.push('SMS failed');
      }
    }

    const success = results.some((result) => result.includes('successfully'));
    const message = results.join(', ');

    return { success, message };
  }

  private async sendOtpEmail(otpData: OtpData): Promise<void> {
    const mailOptions = {
      from: this.configService.get('SMTP_FROM', 'noreply@hotel.com'),
      to: otpData.guestEmail,
      subject: 'Your Check-in Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Check-in Verification Code</h2>
          <p>Dear Guest,</p>
          <p>Your verification code for check-in is:</p>
          <div style="background-color: #f8f9fa; border: 2px solid #dee2e6; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="font-size: 36px; margin: 0; color: #007bff; letter-spacing: 5px;">${otpData.otp}</h1>
          </div>
          <p><strong>Important:</strong></p>
          <ul>
            <li>This code will expire in 15 minutes</li>
            <li>Do not share this code with anyone</li>
            <li>Use this code only for your check-in process</li>
          </ul>
          <p>If you didn't request this code, please ignore this email.</p>
          <p>Best regards,<br>Hotel Management Team</p>
        </div>
      `,
    };

    await this.emailTransporter.sendMail(mailOptions);
  }

  private async sendOtpSms(otpData: OtpData): Promise<void> {
    // This would integrate with an SMS service like Twilio, AWS SNS, etc.
    // For now, we'll just log it
    console.log(
      `SMS OTP to ${otpData.guestPhone}: Your check-in code is ${otpData.otp}. Valid for 15 minutes.`
    );

    // TODO: Implement actual SMS sending
    // const smsService = new SMSService(this.configService);
    // await smsService.send(otpData.guestPhone, `Your check-in code is ${otpData.otp}. Valid for 15 minutes.`);
  }

  private async storeOtpData(
    reservationId: string,
    otpData: OtpData
  ): Promise<void> {
    const key = `otp:${reservationId}`;
    const ttl = Math.floor((otpData.expiresAt.getTime() - Date.now()) / 1000);

    if (ttl > 0) {
      await this.redis.setex(key, ttl, JSON.stringify(otpData));
    }
  }

  private async getOtpData(reservationId: string): Promise<OtpData | null> {
    const key = `otp:${reservationId}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      const otpData = JSON.parse(data) as OtpData;
      otpData.createdAt = new Date(otpData.createdAt);
      otpData.expiresAt = new Date(otpData.expiresAt);
      if (otpData.lastAttemptAt) {
        otpData.lastAttemptAt = new Date(otpData.lastAttemptAt);
      }
      return otpData;
    } catch (error) {
      console.error('Failed to parse OTP data:', error);
      return null;
    }
  }

  private isOtpExpired(otpData: OtpData): boolean {
    return new Date() > otpData.expiresAt;
  }
}
