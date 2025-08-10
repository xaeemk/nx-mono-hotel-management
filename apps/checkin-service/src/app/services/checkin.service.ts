import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto-js';
import { QrService } from './qr.service';
import { OtpService } from './otp.service';
import { InitiateCheckinDto, CheckinResponseDto } from '../dto/checkin.dto';

export interface CheckinSession {
  reservationId: string;
  guestEmail: string;
  guestPhone?: string;
  checkinMethod: string;
  qrToken?: string;
  otpSent?: boolean;
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'otp_verified' | 'qr_verified' | 'completed';
  attempts: number;
  lastAttemptAt?: Date;
}

@Injectable()
export class CheckinService {
  private readonly redis: Redis;
  private readonly prisma: PrismaClient;
  private readonly SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly configService: ConfigService,
    private readonly qrService: QrService,
    private readonly otpService: OtpService
  ) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_CHECKIN_DB', 2),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    this.prisma = new PrismaClient();
  }

  async initiateCheckin(
    initiateCheckinDto: InitiateCheckinDto
  ): Promise<CheckinResponseDto> {
    const { reservationId, guestEmail, guestPhone, checkinMethod } =
      initiateCheckinDto;

    // Validate reservation exists and is eligible for check-in
    const reservation = await this.validateReservation(
      reservationId,
      guestEmail
    );

    if (!reservation) {
      throw new HttpException(
        'Reservation not found or not eligible for check-in',
        HttpStatus.NOT_FOUND
      );
    }

    // Check for existing active session
    const existingSession = await this.getCheckinSession(reservationId);
    if (existingSession && existingSession.status !== 'completed') {
      // Clean up existing session if expired
      if (new Date() > existingSession.expiresAt) {
        await this.cleanupSession(reservationId);
      } else {
        throw new HttpException(
          'Active check-in session already exists',
          HttpStatus.CONFLICT
        );
      }
    }

    // Create new check-in session
    const session: CheckinSession = {
      reservationId,
      guestEmail,
      guestPhone,
      checkinMethod,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.SESSION_TTL * 1000),
      status: 'pending',
      attempts: 0,
    };

    const response: CheckinResponseDto = {
      success: true,
      message: 'Check-in initiated successfully',
      reservationId,
      availableMethods: [],
      sessionExpiresAt: session.expiresAt,
    };

    // Generate QR code if requested
    if (checkinMethod === 'qr' || checkinMethod === 'both') {
      try {
        const qrResult = await this.qrService.generateQrCode({
          reservationId,
          guestEmail,
          expirationMinutes: this.SESSION_TTL / 60,
        });
        session.qrToken = qrResult.qrToken;
        response.qrToken = qrResult.qrToken;
        response.qrImageUrl = qrResult.qrImageUrl;
        response.availableMethods.push('qr');
      } catch (error) {
        console.error('Failed to generate QR code:', error);
        // Continue without QR if generation fails
      }
    }

    // Generate and send OTP if requested
    if (checkinMethod === 'otp' || checkinMethod === 'both') {
      try {
        const otpResult = await this.otpService.generateOtp(
          reservationId,
          guestEmail,
          guestPhone
        );
        session.otpSent = otpResult.sent;
        response.otpSent = otpResult.sent;
        response.otpExpiresIn = otpResult.expiresIn / 60; // Convert to minutes
        response.availableMethods.push('otp');
      } catch (error) {
        console.error('Failed to generate/send OTP:', error);
        // Continue without OTP if generation fails
      }
    }

    if (response.availableMethods.length === 0) {
      throw new HttpException(
        'No check-in methods available',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    // Store session in Redis
    await this.storeCheckinSession(reservationId, session);

    return response;
  }

  async generateCheckinToken(reservationId: string): Promise<string> {
    const session = await this.getCheckinSession(reservationId);

    if (!session) {
      throw new HttpException(
        'No active check-in session found',
        HttpStatus.NOT_FOUND
      );
    }

    if (session.status !== 'otp_verified' && session.status !== 'qr_verified') {
      throw new HttpException('Check-in not verified', HttpStatus.BAD_REQUEST);
    }

    // Generate secure token
    const tokenData = {
      reservationId,
      timestamp: Date.now(),
      sessionId: crypto
        .SHA256(`${reservationId}-${session.createdAt}`)
        .toString(),
    };

    const token = crypto.AES.encrypt(
      JSON.stringify(tokenData),
      this.configService.get('CHECKIN_SECRET', 'default-secret')
    ).toString();

    // Store token with short TTL (15 minutes)
    await this.redis.setex(`checkin:token:${reservationId}`, 15 * 60, token);

    return token;
  }

  async completeCheckin(
    reservationId: string,
    token: string
  ): Promise<{
    success: boolean;
    message: string;
    roomNumber?: string;
    keyCardData?: any;
  }> {
    // Validate token
    const storedToken = await this.redis.get(`checkin:token:${reservationId}`);
    if (!storedToken || storedToken !== token) {
      throw new HttpException(
        'Invalid or expired check-in token',
        HttpStatus.BAD_REQUEST
      );
    }

    const session = await this.getCheckinSession(reservationId);
    if (!session) {
      throw new HttpException(
        'No active check-in session found',
        HttpStatus.NOT_FOUND
      );
    }

    if (session.status === 'completed') {
      throw new HttpException(
        'Check-in already completed',
        HttpStatus.CONFLICT
      );
    }

    try {
      // Update reservation status in database
      const reservation = await this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          status: 'CHECKED_IN',
          actualCheckIn: new Date(),
        },
        include: {
          room: true,
        },
      });

      // Update room status to occupied
      await this.prisma.room.update({
        where: { id: reservation.roomId },
        data: {
          status: 'OCCUPIED',
        },
      });

      // Generate key card data (this would integrate with your key card system)
      const keyCardData = await this.generateKeyCardData(
        reservationId,
        reservation.room.roomNumber
      );

      // Update session status
      session.status = 'completed';
      await this.storeCheckinSession(reservationId, session);

      // Clean up token
      await this.redis.del(`checkin:token:${reservationId}`);

      // Trigger door lock activation via MQTT (if needed)
      await this.activateDoorLock(reservation.room.roomNumber, reservation.id);

      return {
        success: true,
        message: 'Check-in completed successfully',
        roomNumber: reservation.room.roomNumber,
        keyCardData,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to complete check-in: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getCheckinStatus(reservationId: string): Promise<{
    reservationId: string;
    status: string;
    canCheckin: boolean;
    checkinTime?: Date;
    roomNumber?: string;
  }> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { room: true },
    });

    if (!reservation) {
      throw new HttpException('Reservation not found', HttpStatus.NOT_FOUND);
    }

    const session = await this.getCheckinSession(reservationId);
    const canCheckin = this.canInitiateCheckin(reservation);

    return {
      reservationId,
      status: reservation.status,
      canCheckin,
      checkinTime: reservation.actualCheckIn,
      roomNumber: reservation.room?.roomNumber,
    };
  }

  private async validateReservation(reservationId: string, guestEmail: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        guest: true,
        room: true,
      },
    });

    if (!reservation || reservation.guest.email !== guestEmail) {
      return null;
    }

    return reservation;
  }

  private canInitiateCheckin(reservation: any): boolean {
    const today = new Date();
    const checkInDate = new Date(reservation.checkInDate);
    const checkOutDate = new Date(reservation.checkOutDate);

    // Can check in from 6 hours before check-in date until check-out date
    const earliestCheckin = new Date(
      checkInDate.getTime() - 6 * 60 * 60 * 1000
    );

    return (
      reservation.status === 'CONFIRMED' &&
      today >= earliestCheckin &&
      today <= checkOutDate
    );
  }

  private async storeCheckinSession(
    reservationId: string,
    session: CheckinSession
  ) {
    const key = `checkin:session:${reservationId}`;
    await this.redis.setex(key, this.SESSION_TTL, JSON.stringify(session));
  }

  private async getCheckinSession(
    reservationId: string
  ): Promise<CheckinSession | null> {
    const key = `checkin:session:${reservationId}`;
    const sessionData = await this.redis.get(key);

    if (!sessionData) {
      return null;
    }

    try {
      const session = JSON.parse(sessionData) as CheckinSession;
      session.createdAt = new Date(session.createdAt);
      session.expiresAt = new Date(session.expiresAt);
      if (session.lastAttemptAt) {
        session.lastAttemptAt = new Date(session.lastAttemptAt);
      }
      return session;
    } catch (error) {
      console.error('Failed to parse check-in session:', error);
      return null;
    }
  }

  private async cleanupSession(reservationId: string) {
    const keys = [
      `checkin:session:${reservationId}`,
      `checkin:token:${reservationId}`,
    ];

    await Promise.all(keys.map((key) => this.redis.del(key)));
  }

  private async generateKeyCardData(reservationId: string, roomNumber: string) {
    // This would integrate with your physical key card system
    // For now, we'll return mock data
    return {
      keyCardId: crypto
        .SHA256(`${reservationId}-${roomNumber}-${Date.now()}`)
        .toString(),
      roomNumber,
      validFrom: new Date(),
      validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      accessLevel: 'guest',
      permissions: ['room_access', 'elevator_access', 'common_areas'],
    };
  }

  private async activateDoorLock(roomNumber: string, reservationId: string) {
    // This would send MQTT message to door lock system
    // For now, we'll just log it
    console.log(
      `Activating door lock for room ${roomNumber}, reservation ${reservationId}`
    );

    // TODO: Implement MQTT publisher for door lock activation
    // await this.mqttService.publish('hotel/rooms/${roomNumber}/lock/activate', {
    //   reservationId,
    //   timestamp: new Date(),
    //   action: 'activate'
    // });
  }
}
