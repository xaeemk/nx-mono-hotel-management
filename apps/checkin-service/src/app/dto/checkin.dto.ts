import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  Length,
  Matches,
} from 'class-validator';

export class InitiateCheckinDto {
  @ApiProperty({
    description: 'Reservation ID',
    example: 'clw8k9j2l0001w8h9p5z3q7x1',
  })
  @IsString()
  @IsNotEmpty()
  reservationId: string;

  @ApiProperty({
    description: 'Guest email address',
    example: 'guest@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  guestEmail: string;

  @ApiProperty({
    description: 'Guest phone number',
    example: '+1234567890',
    required: false,
  })
  @IsOptional()
  @IsString()
  guestPhone?: string;

  @ApiProperty({
    description: 'Preferred check-in method',
    enum: ['qr', 'otp', 'both'],
    example: 'both',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^(qr|otp|both)$/)
  checkinMethod?: 'qr' | 'otp' | 'both' = 'both';
}

export class ValidateOtpDto {
  @ApiProperty({
    description: 'Reservation ID',
    example: 'clw8k9j2l0001w8h9p5z3q7x1',
  })
  @IsString()
  @IsNotEmpty()
  reservationId: string;

  @ApiProperty({
    description: '6-digit OTP code',
    example: '123456',
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otp: string;
}

export class OtpGenerationDto {
  @ApiProperty({
    description: 'Reservation ID',
    example: 'clw8k9j2l0001w8h9p5z3q7x1',
  })
  @IsString()
  @IsNotEmpty()
  reservationId: string;

  @ApiProperty({
    description: 'Guest email address',
    example: 'guest@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  guestEmail: string;

  @ApiProperty({
    description: 'Guest phone number for SMS OTP',
    example: '+1234567890',
    required: false,
  })
  @IsOptional()
  @IsString()
  guestPhone?: string;

  @ApiProperty({
    description: 'Delivery method for OTP',
    enum: ['email', 'sms', 'both'],
    example: 'both',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^(email|sms|both)$/)
  deliveryMethod?: 'email' | 'sms' | 'both' = 'both';
}

export class CheckinResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Check-in initiated successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Reservation ID',
    example: 'clw8k9j2l0001w8h9p5z3q7x1',
  })
  reservationId: string;

  @ApiProperty({
    description: 'QR code token (if QR method enabled)',
    example: 'qr_clw8k9j2l0001w8h9p5z3q7x1_abc123',
    required: false,
  })
  qrToken?: string;

  @ApiProperty({
    description: 'QR code image URL (if QR method enabled)',
    example: '/api/v1/qr/image/qr_clw8k9j2l0001w8h9p5z3q7x1_abc123',
    required: false,
  })
  qrImageUrl?: string;

  @ApiProperty({
    description: 'OTP sent status (if OTP method enabled)',
    example: true,
    required: false,
  })
  otpSent?: boolean;

  @ApiProperty({
    description: 'OTP expiration time in minutes',
    example: 15,
    required: false,
  })
  otpExpiresIn?: number;

  @ApiProperty({
    description: 'Available check-in methods',
    example: ['qr', 'otp'],
  })
  availableMethods: string[];

  @ApiProperty({
    description: 'Check-in session expires at',
    example: '2024-01-15T10:30:00Z',
  })
  sessionExpiresAt: Date;
}
