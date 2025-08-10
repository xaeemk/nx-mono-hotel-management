import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Res,
  HttpStatus,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { QrService } from '../services/qr.service';
import { GenerateQrDto, ValidateQrDto, QrResponseDto } from '../dto/qr.dto';

@ApiTags('QR Code')
@Controller('qr')
@UseGuards(ThrottlerGuard)
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate QR code for check-in' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'QR code generated successfully',
    type: QrResponseDto,
  })
  async generateQr(
    @Body() generateQrDto: GenerateQrDto
  ): Promise<QrResponseDto> {
    try {
      return await this.qrService.generateQrCode(generateQrDto);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate QR code',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('image/:qrToken')
  @ApiOperation({ summary: 'Get QR code image' })
  @ApiProduces('image/png')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'QR code image',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'QR code not found or expired',
  })
  async getQrImage(
    @Param('qrToken') qrToken: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      const qrImageBuffer = await this.qrService.getQrImage(qrToken);

      res.set({
        'Content-Type': 'image/png',
        'Content-Disposition': 'inline; filename="checkin-qr.png"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });

      res.send(qrImageBuffer);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get QR code image',
        error.status || HttpStatus.NOT_FOUND
      );
    }
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate QR code for check-in' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'QR code validated successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired QR code',
  })
  async validateQr(@Body() validateQrDto: ValidateQrDto): Promise<{
    success: boolean;
    message: string;
    reservationId?: string;
    checkinToken?: string;
  }> {
    try {
      const validationResult = await this.qrService.validateQrCode(
        validateQrDto.qrToken
      );

      if (!validationResult.isValid) {
        throw new HttpException(
          'Invalid or expired QR code',
          HttpStatus.BAD_REQUEST
        );
      }

      return {
        success: true,
        message: 'QR code validated successfully',
        reservationId: validationResult.reservationId,
        checkinToken: validationResult.checkinToken,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to validate QR code',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('status/:qrToken')
  @ApiOperation({ summary: 'Get QR code status and information' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'QR code status retrieved successfully',
  })
  async getQrStatus(@Param('qrToken') qrToken: string): Promise<{
    isValid: boolean;
    expiresAt: Date;
    reservationId?: string;
    guestName?: string;
    roomNumber?: string;
    used: boolean;
  }> {
    try {
      return await this.qrService.getQrStatus(qrToken);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get QR code status',
        error.status || HttpStatus.NOT_FOUND
      );
    }
  }

  @Post('refresh/:reservationId')
  @ApiOperation({ summary: 'Refresh/regenerate QR code for reservation' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'QR code refreshed successfully',
    type: QrResponseDto,
  })
  async refreshQr(
    @Param('reservationId') reservationId: string
  ): Promise<QrResponseDto> {
    try {
      return await this.qrService.refreshQrCode(reservationId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to refresh QR code',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
