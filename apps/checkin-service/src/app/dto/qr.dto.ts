import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsUrl,
} from 'class-validator';

export class GenerateQrDto {
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
    description: 'Expiration time in minutes (default: 1440 = 24 hours)',
    example: 1440,
    required: false,
  })
  @IsOptional()
  expirationMinutes?: number = 1440;

  @ApiProperty({
    description: 'Custom data to embed in QR code',
    example: { roomType: 'deluxe', specialRequests: 'late checkout' },
    required: false,
  })
  @IsOptional()
  customData?: Record<string, any>;
}

export class ValidateQrDto {
  @ApiProperty({
    description: 'QR token to validate',
    example: 'qr_clw8k9j2l0001w8h9p5z3q7x1_abc123',
  })
  @IsString()
  @IsNotEmpty()
  qrToken: string;

  @ApiProperty({
    description: 'Optional validation context',
    example: { deviceId: 'tablet-001', location: 'lobby' },
    required: false,
  })
  @IsOptional()
  context?: Record<string, any>;
}

export class QrResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'QR code generated successfully',
  })
  message: string;

  @ApiProperty({
    description: 'QR token',
    example: 'qr_clw8k9j2l0001w8h9p5z3q7x1_abc123',
  })
  qrToken: string;

  @ApiProperty({
    description: 'QR code image URL',
    example: '/api/v1/qr/image/qr_clw8k9j2l0001w8h9p5z3q7x1_abc123',
  })
  qrImageUrl: string;

  @ApiProperty({
    description: 'QR code data as base64 encoded PNG',
    example: 'iVBORw0KGgoAAAANSUhEUgAA...',
    required: false,
  })
  qrImageBase64?: string;

  @ApiProperty({
    description: 'Expiration timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  expiresAt: Date;

  @ApiProperty({
    description: 'Reservation ID',
    example: 'clw8k9j2l0001w8h9p5z3q7x1',
  })
  reservationId: string;

  @ApiProperty({
    description: 'QR code size in pixels',
    example: 256,
  })
  qrSize: number;

  @ApiProperty({
    description: 'QR code error correction level',
    example: 'M',
  })
  errorCorrectionLevel: string;
}
