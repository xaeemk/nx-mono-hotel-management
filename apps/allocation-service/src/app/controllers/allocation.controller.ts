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
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  AllocationService,
  AllocationRequest,
  AllocationResult,
} from '../services/allocation.service';

@ApiTags('Allocation')
@Controller('allocation')
@UseGuards(ThrottlerGuard)
export class AllocationController {
  constructor(private readonly allocationService: AllocationService) {}

  @Post('allocate')
  @ApiOperation({ summary: 'Allocate the best available room' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Room allocated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No suitable rooms available',
  })
  async allocateRoom(
    @Body() request: AllocationRequest
  ): Promise<AllocationResult> {
    try {
      return await this.allocationService.allocateRoom(request);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to allocate room',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('next-clean')
  @ApiOperation({
    summary: 'Get next available clean room (first-clean-first-serve)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Next clean room retrieved successfully',
  })
  async getNextCleanRoom(@Query('roomType') roomType?: string): Promise<{
    roomId: string | null;
    message: string;
  }> {
    try {
      const roomId = await this.allocationService.getNextCleanRoom(roomType);
      return {
        roomId,
        message: roomId ? 'Next clean room found' : 'No clean rooms available',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get next clean room',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('clean-rooms/stats')
  @ApiOperation({ summary: 'Get clean rooms queue statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Clean rooms statistics retrieved successfully',
  })
  async getCleanRoomsStats() {
    try {
      return await this.allocationService.getCleanRoomsStats();
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get clean rooms statistics',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('clean-rooms/queue')
  @ApiOperation({ summary: 'Get clean rooms queue in order' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Clean rooms queue retrieved successfully',
  })
  async getCleanRoomsQueue() {
    try {
      return await this.allocationService.getCleanRoomsQueue();
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get clean rooms queue',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('room/:roomId/clean')
  @ApiOperation({ summary: 'Mark room as clean and add to allocation queue' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Room marked as clean successfully',
  })
  async markRoomAsClean(
    @Param('roomId') roomId: string,
    @Body() body?: { priority?: number }
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.allocationService.addCleanRoom(
        roomId,
        new Date(),
        body?.priority || 0
      );
      return {
        success: true,
        message: 'Room marked as clean and added to allocation queue',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to mark room as clean',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('room/:roomId/remove')
  @ApiOperation({ summary: 'Remove room from clean rooms queue' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Room removed from queue successfully',
  })
  async removeRoomFromQueue(@Param('roomId') roomId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      await this.allocationService.removeCleanRoom(roomId);
      return {
        success: true,
        message: 'Room removed from clean rooms queue',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to remove room from queue',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('room/:roomId/status')
  @ApiOperation({ summary: 'Update room cleaning status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Room status updated successfully',
  })
  async updateRoomStatus(
    @Param('roomId') roomId: string,
    @Body() body: { status: 'clean' | 'dirty' | 'cleaning' | 'maintenance' }
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.allocationService.updateRoomCleaningStatus(
        roomId,
        body.status
      );
      return {
        success: true,
        message: `Room status updated to ${body.status}`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update room status',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
