import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

export interface RoomAvailability {
  roomId: string;
  roomNumber: string;
  roomType: string;
  cleanedAt: Date;
  priority: number;
  reservedUntil?: Date;
  maintenanceUntil?: Date;
  specialRequests?: string[];
}

export interface AllocationRequest {
  checkInDate: Date;
  checkOutDate: Date;
  roomType: string;
  adults: number;
  children: number;
  specialRequests?: string[];
  preferredFloor?: number;
  accessibilityNeeds?: boolean;
  priorityLevel: 'standard' | 'vip' | 'loyalty' | 'urgent';
}

export interface AllocationResult {
  roomId: string;
  roomNumber: string;
  roomType: string;
  allocationScore: number;
  cleanedAt: Date;
  estimatedReadyTime?: Date;
  alternativeRooms?: {
    roomId: string;
    roomNumber: string;
    score: number;
  }[];
}

@Injectable()
export class AllocationService {
  private readonly logger = new Logger(AllocationService.name);
  private readonly redis: Redis;
  private readonly prisma: PrismaClient;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_ALLOCATION_DB', 7),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    this.prisma = new PrismaClient();
  }

  /**
   * Add or update a room in the available clean rooms sorted set
   * Score is based on: (cleanedTimestamp + priorityBonus)
   */
  async addCleanRoom(
    roomId: string,
    cleanedAt: Date,
    priority: number = 0
  ): Promise<void> {
    const score = cleanedAt.getTime() + priority * 3600000; // priority hours bonus
    await this.redis.zadd('clean_rooms', score, roomId);

    // Store room metadata
    const roomData = {
      roomId,
      cleanedAt: cleanedAt.toISOString(),
      priority,
      addedAt: new Date().toISOString(),
    };

    await this.redis.hset('room_metadata', roomId, JSON.stringify(roomData));

    this.logger.log(
      `Added room ${roomId} to clean rooms queue with score ${score}`
    );
  }

  /**
   * Remove a room from the available clean rooms (when allocated)
   */
  async removeCleanRoom(roomId: string): Promise<void> {
    await this.redis.zrem('clean_rooms', roomId);
    await this.redis.hdel('room_metadata', roomId);
    this.logger.log(`Removed room ${roomId} from clean rooms queue`);
  }

  /**
   * Get the next available clean room (first-clean-first-serve)
   */
  async getNextCleanRoom(roomType?: string): Promise<string | null> {
    // Get rooms in order (lowest score = cleaned earliest)
    const rooms = await this.redis.zrange('clean_rooms', 0, 9); // Get top 10

    if (rooms.length === 0) {
      return null;
    }

    // If room type specified, filter by type
    if (roomType) {
      for (const roomId of rooms) {
        const room = await this.prisma.room.findUnique({
          where: { id: roomId },
        });

        if (room && room.roomType === roomType) {
          return roomId;
        }
      }
      return null; // No rooms of specified type available
    }

    return rooms[0]; // Return first (earliest cleaned) room
  }

  /**
   * Allocate the best available room based on the allocation algorithm
   */
  async allocateRoom(request: AllocationRequest): Promise<AllocationResult> {
    // Get candidate rooms based on criteria
    const candidates = await this.findCandidateRooms(request);

    if (candidates.length === 0) {
      throw new HttpException(
        'No suitable rooms available',
        HttpStatus.NOT_FOUND
      );
    }

    // Score and rank candidates
    const scoredCandidates = await this.scoreRooms(candidates, request);

    // Select best room
    const bestRoom = scoredCandidates[0];

    // Reserve the room temporarily (5 minutes)
    await this.temporaryReservation(bestRoom.roomId, 5 * 60);

    // Remove from clean rooms queue
    await this.removeCleanRoom(bestRoom.roomId);

    const result: AllocationResult = {
      roomId: bestRoom.roomId,
      roomNumber: bestRoom.roomNumber,
      roomType: bestRoom.roomType,
      allocationScore: bestRoom.score,
      cleanedAt: bestRoom.cleanedAt,
      alternativeRooms: scoredCandidates.slice(1, 4).map((room) => ({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        score: room.score,
      })),
    };

    this.logger.log(
      `Allocated room ${bestRoom.roomNumber} with score ${bestRoom.score}`
    );
    return result;
  }

  private async findCandidateRooms(
    request: AllocationRequest
  ): Promise<RoomAvailability[]> {
    const candidates: RoomAvailability[] = [];

    // Get clean rooms from sorted set
    const cleanRooms = await this.redis.zrange(
      'clean_rooms',
      0,
      -1,
      'WITHSCORES'
    );

    for (let i = 0; i < cleanRooms.length; i += 2) {
      const roomId = cleanRooms[i];
      const score = parseFloat(cleanRooms[i + 1]);

      // Get room details from database
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!room) continue;

      // Check if room meets basic criteria
      if (request.roomType && room.roomType !== request.roomType) {
        continue;
      }

      if (room.maxOccupancy < request.adults + request.children) {
        continue;
      }

      if (request.accessibilityNeeds && !room.isAccessible) {
        continue;
      }

      // Check availability for the requested dates
      const isAvailable = await this.isRoomAvailable(
        roomId,
        request.checkInDate,
        request.checkOutDate
      );
      if (!isAvailable) {
        continue;
      }

      // Get metadata
      const metadataJson = await this.redis.hget('room_metadata', roomId);
      let cleanedAt = new Date(score);
      let priority = 0;

      if (metadataJson) {
        try {
          const metadata = JSON.parse(metadataJson);
          cleanedAt = new Date(metadata.cleanedAt);
          priority = metadata.priority || 0;
        } catch (error) {
          this.logger.warn(
            `Failed to parse metadata for room ${roomId}:`,
            error
          );
        }
      }

      candidates.push({
        roomId,
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        cleanedAt,
        priority,
      });
    }

    return candidates;
  }

  private async scoreRooms(
    candidates: RoomAvailability[],
    request: AllocationRequest
  ): Promise<Array<RoomAvailability & { score: number }>> {
    const scoredRooms = [];

    for (const room of candidates) {
      let score = 0;

      // Base score: favor earlier cleaned rooms (first-clean-first-serve)
      const hoursSinceCleaning =
        (Date.now() - room.cleanedAt.getTime()) / (1000 * 60 * 60);
      score += Math.max(0, 100 - hoursSinceCleaning); // Higher score for recently cleaned

      // Priority bonus
      score += room.priority * 50;

      // Guest priority bonus
      switch (request.priorityLevel) {
        case 'urgent':
          score += 200;
          break;
        case 'vip':
          score += 150;
          break;
        case 'loyalty':
          score += 100;
          break;
        case 'standard':
          score += 50;
          break;
      }

      // Room type exact match bonus
      if (room.roomType === request.roomType) {
        score += 75;
      }

      // Preferred floor bonus
      if (request.preferredFloor) {
        const roomDetails = await this.prisma.room.findUnique({
          where: { id: room.roomId },
          select: { floor: true },
        });

        if (roomDetails && roomDetails.floor === request.preferredFloor) {
          score += 25;
        }
      }

      // Special requests penalty (more complex rooms to prepare)
      if (request.specialRequests && request.specialRequests.length > 0) {
        score -= request.specialRequests.length * 10;
      }

      scoredRooms.push({
        ...room,
        score: Math.round(score),
      });
    }

    // Sort by score (highest first)
    scoredRooms.sort((a, b) => b.score - a.score);

    return scoredRooms;
  }

  private async isRoomAvailable(
    roomId: string,
    checkIn: Date,
    checkOut: Date
  ): Promise<boolean> {
    const conflictingReservations = await this.prisma.reservation.count({
      where: {
        roomId,
        status: {
          in: ['CONFIRMED', 'CHECKED_IN'],
        },
        OR: [
          {
            AND: [
              { checkInDate: { lte: checkIn } },
              { checkOutDate: { gt: checkIn } },
            ],
          },
          {
            AND: [
              { checkInDate: { lt: checkOut } },
              { checkOutDate: { gte: checkOut } },
            ],
          },
          {
            AND: [
              { checkInDate: { gte: checkIn } },
              { checkOutDate: { lte: checkOut } },
            ],
          },
        ],
      },
    });

    return conflictingReservations === 0;
  }

  private async temporaryReservation(
    roomId: string,
    seconds: number
  ): Promise<void> {
    const key = `temp_reservation:${roomId}`;
    await this.redis.setex(key, seconds, Date.now().toString());
  }

  /**
   * Get statistics about the clean rooms queue
   */
  async getCleanRoomsStats(): Promise<{
    totalCleanRooms: number;
    averageCleaningAge: number;
    roomsByType: Record<string, number>;
    oldestCleanedRoom?: {
      roomId: string;
      roomNumber: string;
      cleanedAt: Date;
      hoursAgo: number;
    };
  }> {
    const cleanRooms = await this.redis.zrange(
      'clean_rooms',
      0,
      -1,
      'WITHSCORES'
    );

    if (cleanRooms.length === 0) {
      return {
        totalCleanRooms: 0,
        averageCleaningAge: 0,
        roomsByType: {},
      };
    }

    let totalAge = 0;
    const roomsByType: Record<string, number> = {};
    let oldestRoom: any = null;
    let oldestTime = Date.now();

    for (let i = 0; i < cleanRooms.length; i += 2) {
      const roomId = cleanRooms[i];
      const score = parseFloat(cleanRooms[i + 1]);
      const cleanedAt = new Date(score);
      const ageHours = (Date.now() - cleanedAt.getTime()) / (1000 * 60 * 60);

      totalAge += ageHours;

      if (cleanedAt.getTime() < oldestTime) {
        oldestTime = cleanedAt.getTime();

        // Get room details for oldest room
        const room = await this.prisma.room.findUnique({
          where: { id: roomId },
          select: { roomNumber: true, roomType: true },
        });

        if (room) {
          oldestRoom = {
            roomId,
            roomNumber: room.roomNumber,
            cleanedAt,
            hoursAgo: ageHours,
          };

          roomsByType[room.roomType] = (roomsByType[room.roomType] || 0) + 1;
        }
      }
    }

    return {
      totalCleanRooms: cleanRooms.length / 2,
      averageCleaningAge: totalAge / (cleanRooms.length / 2),
      roomsByType,
      oldestCleanedRoom: oldestRoom,
    };
  }

  /**
   * Get all clean rooms in order
   */
  async getCleanRoomsQueue(): Promise<
    Array<{
      roomId: string;
      roomNumber: string;
      roomType: string;
      cleanedAt: Date;
      hoursAgo: number;
      position: number;
    }>
  > {
    const cleanRooms = await this.redis.zrange(
      'clean_rooms',
      0,
      -1,
      'WITHSCORES'
    );
    const queue = [];

    for (let i = 0; i < cleanRooms.length; i += 2) {
      const roomId = cleanRooms[i];
      const score = parseFloat(cleanRooms[i + 1]);
      const cleanedAt = new Date(score);
      const hoursAgo = (Date.now() - cleanedAt.getTime()) / (1000 * 60 * 60);

      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: { roomNumber: true, roomType: true },
      });

      if (room) {
        queue.push({
          roomId,
          roomNumber: room.roomNumber,
          roomType: room.roomType,
          cleanedAt,
          hoursAgo: Math.round(hoursAgo * 100) / 100,
          position: i / 2 + 1,
        });
      }
    }

    return queue;
  }

  /**
   * Force update room cleaning status (for housekeeping service integration)
   */
  async updateRoomCleaningStatus(
    roomId: string,
    status: 'clean' | 'dirty' | 'cleaning' | 'maintenance'
  ): Promise<void> {
    switch (status) {
      case 'clean':
        await this.addCleanRoom(roomId, new Date());
        break;
      case 'dirty':
      case 'cleaning':
      case 'maintenance':
        await this.removeCleanRoom(roomId);
        break;
    }

    this.logger.log(`Updated room ${roomId} status to ${status}`);
  }
}
