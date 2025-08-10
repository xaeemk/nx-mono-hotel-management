import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpStatus,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CheckinService } from '../services/checkin.service';
import { OtpService } from '../services/otp.service';
import {
  InitiateCheckinDto,
  ValidateOtpDto,
  CheckinResponseDto,
  OtpGenerationDto,
} from '../dto/checkin.dto';

@ApiTags('Check-in')
@Controller('checkin')
@UseGuards(ThrottlerGuard)
export class CheckinController {
  constructor(
    private readonly checkinService: CheckinService,
    private readonly otpService: OtpService
  ) {}

  @Post('initiate')
  @ApiOperation({ summary: 'Initiate check-in process' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Check-in initiated successfully',
    type: CheckinResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request data',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Reservation not found',
  })
  async initiateCheckin(
    @Body() initiateCheckinDto: InitiateCheckinDto
  ): Promise<CheckinResponseDto> {
    try {
      return await this.checkinService.initiateCheckin(initiateCheckinDto);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to initiate check-in',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('validate-otp')
  @ApiOperation({ summary: 'Validate OTP for check-in' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OTP validated successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid OTP or expired',
  })
  async validateOtp(@Body() validateOtpDto: ValidateOtpDto): Promise<{
    success: boolean;
    message: string;
    checkinToken?: string;
  }> {
    try {
      const isValid = await this.otpService.validateOtp(
        validateOtpDto.reservationId,
        validateOtpDto.otp
      );

      if (!isValid) {
        throw new HttpException(
          'Invalid or expired OTP',
          HttpStatus.BAD_REQUEST
        );
      }

      // Generate check-in token for completing the process
      const checkinToken = await this.checkinService.generateCheckinToken(
        validateOtpDto.reservationId
      );

      return {
        success: true,
        message: 'OTP validated successfully',
        checkinToken,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to validate OTP',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('complete/:reservationId')
  @ApiOperation({ summary: 'Complete check-in process' })
  @ApiQuery({ name: 'token', description: 'Check-in validation token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Check-in completed successfully',
  })
  async completeCheckin(
    @Param('reservationId') reservationId: string,
    @Query('token') token: string
  ): Promise<{
    success: boolean;
    message: string;
    roomNumber?: string;
    keyCardData?: any;
  }> {
    try {
      return await this.checkinService.completeCheckin(reservationId, token);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to complete check-in',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('status/:reservationId')
  @ApiOperation({ summary: 'Get check-in status for reservation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Check-in status retrieved successfully',
  })
  async getCheckinStatus(
    @Param('reservationId') reservationId: string
  ): Promise<{
    reservationId: string;
    status: string;
    canCheckin: boolean;
    checkinTime?: Date;
    roomNumber?: string;
  }> {
    try {
      return await this.checkinService.getCheckinStatus(reservationId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get check-in status',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('generate-otp')
  @ApiOperation({ summary: 'Generate new OTP for check-in' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'OTP generated successfully',
  })
  async generateOtp(@Body() otpGenerationDto: OtpGenerationDto): Promise<{
    success: boolean;
    message: string;
    expiresIn: number;
  }> {
    try {
      const result = await this.otpService.generateOtp(
        otpGenerationDto.reservationId,
        otpGenerationDto.guestEmail,
        otpGenerationDto.guestPhone
      );

      return {
        success: true,
        message: 'OTP generated and sent successfully',
        expiresIn: result.expiresIn,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate OTP',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
