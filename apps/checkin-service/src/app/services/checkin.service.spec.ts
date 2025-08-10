import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { CheckinService, CheckinSession } from './checkin.service';
import { QrService } from './qr.service';
import { OtpService } from './otp.service';
import { InitiateCheckinDto } from '../dto/checkin.dto';

// Mock Redis
jest.mock('ioredis');
const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

// Mock PrismaClient
jest.mock('@prisma/client');
const MockedPrismaClient = PrismaClient as jest.MockedClass<
  typeof PrismaClient
>;

describe('CheckinService', () => {
  let service: CheckinService;
  let configService: ConfigService;
  let qrService: QrService;
  let otpService: OtpService;
  let redis: jest.Mocked<Redis>;
  let prisma: jest.Mocked<PrismaClient>;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_CHECKIN_DB: 2,
        CHECKIN_SECRET: 'test-secret',
      };
      return config[key] || defaultValue;
    }),
  };

  const mockQrService = {
    generateQrCode: jest.fn(),
  };

  const mockOtpService = {
    generateOtp: jest.fn(),
  };

  const mockReservation = {
    id: 'reservation-123',
    status: 'CONFIRMED',
    checkInDate: new Date('2024-01-15T15:00:00Z'),
    checkOutDate: new Date('2024-01-20T11:00:00Z'),
    roomId: 'room-101',
    guest: {
      id: 'guest-456',
      email: 'guest@example.com',
    },
    room: {
      id: 'room-101',
      roomNumber: '101',
      status: 'AVAILABLE',
    },
  };

  beforeEach(async () => {
    // Create mocked instances
    redis = {
      setex: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    } as any;

    prisma = {
      reservation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      room: {
        update: jest.fn(),
      },
    } as any;

    MockedRedis.mockImplementation(() => redis);
    MockedPrismaClient.mockImplementation(() => prisma);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: QrService,
          useValue: mockQrService,
        },
        {
          provide: OtpService,
          useValue: mockOtpService,
        },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
    configService = module.get<ConfigService>(ConfigService);
    qrService = module.get<QrService>(QrService);
    otpService = module.get<OtpService>(OtpService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateCheckin', () => {
    const initiateCheckinDto: InitiateCheckinDto = {
      reservationId: 'reservation-123',
      guestEmail: 'guest@example.com',
      guestPhone: '+1234567890',
      checkinMethod: 'both',
    };

    it('should successfully initiate check-in with both QR and OTP methods', async () => {
      // Mock reservation validation
      jest
        .spyOn(service as any, 'validateReservation')
        .mockResolvedValue(mockReservation);
      jest.spyOn(service as any, 'getCheckinSession').mockResolvedValue(null);

      // Mock QR service response
      mockQrService.generateQrCode.mockResolvedValue({
        qrToken: 'qr-token-123',
        qrImageUrl: 'https://example.com/qr.png',
      });

      // Mock OTP service response
      mockOtpService.generateOtp.mockResolvedValue({
        sent: true,
        expiresIn: 300, // 5 minutes
      });

      // Mock Redis operations
      redis.setex.mockResolvedValue('OK');

      const result = await service.initiateCheckin(initiateCheckinDto);

      expect(result).toEqual({
        success: true,
        message: 'Check-in initiated successfully',
        reservationId: 'reservation-123',
        availableMethods: ['qr', 'otp'],
        sessionExpiresAt: expect.any(Date),
        qrToken: 'qr-token-123',
        qrImageUrl: 'https://example.com/qr.png',
        otpSent: true,
        otpExpiresIn: 5,
      });

      expect(mockQrService.generateQrCode).toHaveBeenCalledWith({
        reservationId: 'reservation-123',
        guestEmail: 'guest@example.com',
        expirationMinutes: 24 * 60,
      });

      expect(mockOtpService.generateOtp).toHaveBeenCalledWith(
        'reservation-123',
        'guest@example.com',
        '+1234567890'
      );

      expect(redis.setex).toHaveBeenCalledWith(
        'checkin:session:reservation-123',
        24 * 60 * 60,
        expect.any(String)
      );
    });

    it('should throw exception if reservation not found', async () => {
      jest.spyOn(service as any, 'validateReservation').mockResolvedValue(null);

      await expect(service.initiateCheckin(initiateCheckinDto)).rejects.toThrow(
        new HttpException(
          'Reservation not found or not eligible for check-in',
          HttpStatus.NOT_FOUND
        )
      );
    });

    it('should throw exception if active session already exists', async () => {
      jest
        .spyOn(service as any, 'validateReservation')
        .mockResolvedValue(mockReservation);

      const existingSession: CheckinSession = {
        reservationId: 'reservation-123',
        guestEmail: 'guest@example.com',
        checkinMethod: 'qr',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000), // Future expiry
        status: 'pending',
        attempts: 0,
      };

      jest
        .spyOn(service as any, 'getCheckinSession')
        .mockResolvedValue(existingSession);

      await expect(service.initiateCheckin(initiateCheckinDto)).rejects.toThrow(
        new HttpException(
          'Active check-in session already exists',
          HttpStatus.CONFLICT
        )
      );
    });

    it('should clean up expired session and create new one', async () => {
      jest
        .spyOn(service as any, 'validateReservation')
        .mockResolvedValue(mockReservation);

      const expiredSession: CheckinSession = {
        reservationId: 'reservation-123',
        guestEmail: 'guest@example.com',
        checkinMethod: 'qr',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 60000), // Past expiry
        status: 'pending',
        attempts: 0,
      };

      jest
        .spyOn(service as any, 'getCheckinSession')
        .mockResolvedValue(expiredSession);
      jest.spyOn(service as any, 'cleanupSession').mockResolvedValue(undefined);

      mockQrService.generateQrCode.mockResolvedValue({
        qrToken: 'qr-token-123',
        qrImageUrl: 'https://example.com/qr.png',
      });

      mockOtpService.generateOtp.mockResolvedValue({
        sent: true,
        expiresIn: 300,
      });

      redis.setex.mockResolvedValue('OK');

      const result = await service.initiateCheckin(initiateCheckinDto);

      expect(service['cleanupSession']).toHaveBeenCalledWith('reservation-123');
      expect(result.success).toBe(true);
    });

    it('should handle QR generation failure gracefully', async () => {
      jest
        .spyOn(service as any, 'validateReservation')
        .mockResolvedValue(mockReservation);
      jest.spyOn(service as any, 'getCheckinSession').mockResolvedValue(null);

      // Mock QR service failure
      mockQrService.generateQrCode.mockRejectedValue(
        new Error('QR generation failed')
      );

      // Mock OTP service success
      mockOtpService.generateOtp.mockResolvedValue({
        sent: true,
        expiresIn: 300,
      });

      redis.setex.mockResolvedValue('OK');

      const result = await service.initiateCheckin(initiateCheckinDto);

      expect(result.availableMethods).toEqual(['otp']);
      expect(result.qrToken).toBeUndefined();
    });

    it('should throw exception if no methods are available', async () => {
      jest
        .spyOn(service as any, 'validateReservation')
        .mockResolvedValue(mockReservation);
      jest.spyOn(service as any, 'getCheckinSession').mockResolvedValue(null);

      // Mock both services failing
      mockQrService.generateQrCode.mockRejectedValue(
        new Error('QR generation failed')
      );
      mockOtpService.generateOtp.mockRejectedValue(
        new Error('OTP generation failed')
      );

      await expect(service.initiateCheckin(initiateCheckinDto)).rejects.toThrow(
        new HttpException(
          'No check-in methods available',
          HttpStatus.INTERNAL_SERVER_ERROR
        )
      );
    });
  });

  describe('generateCheckinToken', () => {
    const reservationId = 'reservation-123';

    it('should generate token for verified session', async () => {
      const verifiedSession: CheckinSession = {
        reservationId,
        guestEmail: 'guest@example.com',
        checkinMethod: 'qr',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        status: 'qr_verified',
        attempts: 1,
      };

      jest
        .spyOn(service as any, 'getCheckinSession')
        .mockResolvedValue(verifiedSession);
      redis.setex.mockResolvedValue('OK');

      const result = await service.generateCheckinToken(reservationId);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(redis.setex).toHaveBeenCalledWith(
        `checkin:token:${reservationId}`,
        15 * 60,
        expect.any(String)
      );
    });

    it('should throw exception for non-existent session', async () => {
      jest.spyOn(service as any, 'getCheckinSession').mockResolvedValue(null);

      await expect(service.generateCheckinToken(reservationId)).rejects.toThrow(
        new HttpException(
          'No active check-in session found',
          HttpStatus.NOT_FOUND
        )
      );
    });

    it('should throw exception for non-verified session', async () => {
      const pendingSession: CheckinSession = {
        reservationId,
        guestEmail: 'guest@example.com',
        checkinMethod: 'qr',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        status: 'pending',
        attempts: 0,
      };

      jest
        .spyOn(service as any, 'getCheckinSession')
        .mockResolvedValue(pendingSession);

      await expect(service.generateCheckinToken(reservationId)).rejects.toThrow(
        new HttpException('Check-in not verified', HttpStatus.BAD_REQUEST)
      );
    });
  });

  describe('completeCheckin', () => {
    const reservationId = 'reservation-123';
    const validToken = 'valid-token';

    it('should complete check-in successfully', async () => {
      const session: CheckinSession = {
        reservationId,
        guestEmail: 'guest@example.com',
        checkinMethod: 'qr',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        status: 'qr_verified',
        attempts: 1,
      };

      const updatedReservation = {
        ...mockReservation,
        status: 'CHECKED_IN',
        actualCheckIn: expect.any(Date),
      };

      // Mock token validation
      redis.get.mockResolvedValue(validToken);
      jest
        .spyOn(service as any, 'getCheckinSession')
        .mockResolvedValue(session);

      // Mock database operations
      prisma.reservation.update.mockResolvedValue(updatedReservation);
      prisma.room.update.mockResolvedValue({ status: 'OCCUPIED' });

      // Mock helper methods
      jest.spyOn(service as any, 'generateKeyCardData').mockResolvedValue({
        keyCardId: 'key-123',
        roomNumber: '101',
      });
      jest
        .spyOn(service as any, 'storeCheckinSession')
        .mockResolvedValue(undefined);
      jest
        .spyOn(service as any, 'activateDoorLock')
        .mockResolvedValue(undefined);

      redis.del.mockResolvedValue(1);

      const result = await service.completeCheckin(reservationId, validToken);

      expect(result).toEqual({
        success: true,
        message: 'Check-in completed successfully',
        roomNumber: '101',
        keyCardData: {
          keyCardId: 'key-123',
          roomNumber: '101',
        },
      });

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: reservationId },
        data: {
          status: 'CHECKED_IN',
          actualCheckIn: expect.any(Date),
        },
        include: {
          room: true,
        },
      });

      expect(redis.del).toHaveBeenCalledWith(`checkin:token:${reservationId}`);
    });

    it('should throw exception for invalid token', async () => {
      redis.get.mockResolvedValue('different-token');

      await expect(
        service.completeCheckin(reservationId, validToken)
      ).rejects.toThrow(
        new HttpException(
          'Invalid or expired check-in token',
          HttpStatus.BAD_REQUEST
        )
      );
    });

    it('should throw exception for already completed check-in', async () => {
      const completedSession: CheckinSession = {
        reservationId,
        guestEmail: 'guest@example.com',
        checkinMethod: 'qr',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        status: 'completed',
        attempts: 1,
      };

      redis.get.mockResolvedValue(validToken);
      jest
        .spyOn(service as any, 'getCheckinSession')
        .mockResolvedValue(completedSession);

      await expect(
        service.completeCheckin(reservationId, validToken)
      ).rejects.toThrow(
        new HttpException('Check-in already completed', HttpStatus.CONFLICT)
      );
    });
  });

  describe('getCheckinStatus', () => {
    const reservationId = 'reservation-123';

    it('should return check-in status for valid reservation', async () => {
      prisma.reservation.findUnique.mockResolvedValue(mockReservation);
      jest.spyOn(service as any, 'getCheckinSession').mockResolvedValue(null);
      jest.spyOn(service as any, 'canInitiateCheckin').mockReturnValue(true);

      const result = await service.getCheckinStatus(reservationId);

      expect(result).toEqual({
        reservationId: 'reservation-123',
        status: 'CONFIRMED',
        canCheckin: true,
        checkinTime: undefined,
        roomNumber: '101',
      });
    });

    it('should throw exception for non-existent reservation', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(service.getCheckinStatus(reservationId)).rejects.toThrow(
        new HttpException('Reservation not found', HttpStatus.NOT_FOUND)
      );
    });
  });

  describe('private methods', () => {
    describe('validateReservation', () => {
      it('should return reservation for valid data', async () => {
        prisma.reservation.findUnique.mockResolvedValue(mockReservation);

        const result = await service['validateReservation'](
          'reservation-123',
          'guest@example.com'
        );

        expect(result).toEqual(mockReservation);
        expect(prisma.reservation.findUnique).toHaveBeenCalledWith({
          where: { id: 'reservation-123' },
          include: {
            guest: true,
            room: true,
          },
        });
      });

      it('should return null for invalid email', async () => {
        const reservationWithDifferentEmail = {
          ...mockReservation,
          guest: { ...mockReservation.guest, email: 'different@example.com' },
        };

        prisma.reservation.findUnique.mockResolvedValue(
          reservationWithDifferentEmail
        );

        const result = await service['validateReservation'](
          'reservation-123',
          'guest@example.com'
        );

        expect(result).toBeNull();
      });
    });

    describe('canInitiateCheckin', () => {
      it('should return true for valid check-in timing', () => {
        // Mock current date to be within check-in window
        const mockDate = new Date('2024-01-15T10:00:00Z'); // 5 hours before check-in
        jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

        const result = service['canInitiateCheckin'](mockReservation);

        expect(result).toBe(true);

        // Restore Date
        (global.Date as any).mockRestore();
      });

      it('should return false for early check-in attempt', () => {
        // Mock current date to be too early
        const mockDate = new Date('2024-01-14T08:00:00Z'); // Too early
        jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

        const result = service['canInitiateCheckin'](mockReservation);

        expect(result).toBe(false);

        (global.Date as any).mockRestore();
      });

      it('should return false for non-confirmed reservation', () => {
        const nonConfirmedReservation = {
          ...mockReservation,
          status: 'PENDING',
        };

        const result = service['canInitiateCheckin'](nonConfirmedReservation);

        expect(result).toBe(false);
      });
    });
  });
});
