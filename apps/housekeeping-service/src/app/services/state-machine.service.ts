import { Injectable, Logger } from '@nestjs/common';
import { createMachine, interpret, Interpreter, State } from 'xstate';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export enum RoomCleaningStatus {
  DIRTY = 'DIRTY',
  CLEANING = 'CLEANING',
  CLEAN = 'CLEAN',
  INSPECTING = 'INSPECTING',
  OUT_OF_ORDER = 'OUT_OF_ORDER',
  MAINTENANCE = 'MAINTENANCE',
}

export enum CleaningEvent {
  START_CLEANING = 'START_CLEANING',
  FINISH_CLEANING = 'FINISH_CLEANING',
  START_INSPECTION = 'START_INSPECTION',
  PASS_INSPECTION = 'PASS_INSPECTION',
  FAIL_INSPECTION = 'FAIL_INSPECTION',
  MARK_OUT_OF_ORDER = 'MARK_OUT_OF_ORDER',
  MARK_MAINTENANCE = 'MARK_MAINTENANCE',
  RESTORE_FROM_OOO = 'RESTORE_FROM_OOO',
  RESTORE_FROM_MAINTENANCE = 'RESTORE_FROM_MAINTENANCE',
  GUEST_CHECKOUT = 'GUEST_CHECKOUT',
}

export interface RoomStateMachineContext {
  roomId: string;
  roomNumber: string;
  assignedHousekeeper?: string;
  startedAt?: Date;
  estimatedDuration?: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  specialInstructions?: string;
  issues?: string[];
  completedTasks?: string[];
  inspectedBy?: string;
  inspectionNotes?: string;
}

@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name);
  private readonly redis: Redis;
  private readonly prisma: PrismaClient;
  private readonly machines = new Map<
    string,
    Interpreter<RoomStateMachineContext>
  >();

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_HOUSEKEEPING_DB', 5),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    this.prisma = new PrismaClient();
  }

  private createRoomStateMachine(context: RoomStateMachineContext) {
    return createMachine<RoomStateMachineContext>(
      {
        id: 'roomCleaning',
        initial: RoomCleaningStatus.DIRTY,
        context,
        states: {
          [RoomCleaningStatus.DIRTY]: {
            on: {
              [CleaningEvent.START_CLEANING]: {
                target: RoomCleaningStatus.CLEANING,
                actions: ['assignHousekeeper', 'setStartTime'],
              },
              [CleaningEvent.MARK_OUT_OF_ORDER]: {
                target: RoomCleaningStatus.OUT_OF_ORDER,
                actions: ['logIssue'],
              },
              [CleaningEvent.MARK_MAINTENANCE]: {
                target: RoomCleaningStatus.MAINTENANCE,
                actions: ['logMaintenanceRequest'],
              },
            },
          },
          [RoomCleaningStatus.CLEANING]: {
            on: {
              [CleaningEvent.FINISH_CLEANING]: {
                target: RoomCleaningStatus.INSPECTING,
                actions: ['completeCleaningTasks', 'requestInspection'],
              },
              [CleaningEvent.MARK_OUT_OF_ORDER]: {
                target: RoomCleaningStatus.OUT_OF_ORDER,
                actions: ['logIssue', 'unassignHousekeeper'],
              },
              [CleaningEvent.MARK_MAINTENANCE]: {
                target: RoomCleaningStatus.MAINTENANCE,
                actions: ['logMaintenanceRequest', 'unassignHousekeeper'],
              },
            },
          },
          [RoomCleaningStatus.INSPECTING]: {
            on: {
              [CleaningEvent.PASS_INSPECTION]: {
                target: RoomCleaningStatus.CLEAN,
                actions: ['recordInspectionPass', 'markRoomReady'],
              },
              [CleaningEvent.FAIL_INSPECTION]: {
                target: RoomCleaningStatus.CLEANING,
                actions: ['recordInspectionFail', 'reassignForCleaning'],
              },
            },
          },
          [RoomCleaningStatus.CLEAN]: {
            on: {
              [CleaningEvent.GUEST_CHECKOUT]: {
                target: RoomCleaningStatus.DIRTY,
                actions: ['resetRoomState'],
              },
              [CleaningEvent.MARK_OUT_OF_ORDER]: {
                target: RoomCleaningStatus.OUT_OF_ORDER,
                actions: ['logIssue'],
              },
              [CleaningEvent.MARK_MAINTENANCE]: {
                target: RoomCleaningStatus.MAINTENANCE,
                actions: ['logMaintenanceRequest'],
              },
            },
          },
          [RoomCleaningStatus.OUT_OF_ORDER]: {
            on: {
              [CleaningEvent.RESTORE_FROM_OOO]: {
                target: RoomCleaningStatus.DIRTY,
                actions: ['clearIssues', 'resetRoomState'],
              },
            },
          },
          [RoomCleaningStatus.MAINTENANCE]: {
            on: {
              [CleaningEvent.RESTORE_FROM_MAINTENANCE]: {
                target: RoomCleaningStatus.DIRTY,
                actions: ['clearMaintenanceFlags', 'resetRoomState'],
              },
            },
          },
        },
      },
      {
        actions: {
          assignHousekeeper: (context, event: any) => {
            context.assignedHousekeeper = event.housekeeperId;
            context.startedAt = new Date();
            this.logger.log(
              `Assigned housekeeper ${event.housekeeperId} to room ${context.roomNumber}`
            );
          },
          setStartTime: (context) => {
            context.startedAt = new Date();
          },
          completeCleaningTasks: (context, event: any) => {
            context.completedTasks = event.completedTasks || [];
            this.logger.log(
              `Completed cleaning tasks for room ${context.roomNumber}`
            );
          },
          requestInspection: (context) => {
            this.logger.log(
              `Inspection requested for room ${context.roomNumber}`
            );
          },
          recordInspectionPass: (context, event: any) => {
            context.inspectedBy = event.inspectorId;
            context.inspectionNotes = event.notes;
            this.logger.log(`Room ${context.roomNumber} passed inspection`);
          },
          recordInspectionFail: (context, event: any) => {
            context.inspectedBy = event.inspectorId;
            context.inspectionNotes = event.notes;
            context.issues = event.issues || [];
            this.logger.log(
              `Room ${
                context.roomNumber
              } failed inspection: ${event.issues?.join(', ')}`
            );
          },
          reassignForCleaning: (context) => {
            context.assignedHousekeeper = undefined;
            context.startedAt = undefined;
          },
          markRoomReady: (context) => {
            this.logger.log(`Room ${context.roomNumber} is ready for guests`);
          },
          logIssue: (context, event: any) => {
            context.issues = [...(context.issues || []), event.issue];
            this.logger.warn(
              `Room ${context.roomNumber} marked out of order: ${event.issue}`
            );
          },
          logMaintenanceRequest: (context, event: any) => {
            context.specialInstructions = event.maintenanceRequest;
            this.logger.log(
              `Maintenance requested for room ${context.roomNumber}: ${event.maintenanceRequest}`
            );
          },
          unassignHousekeeper: (context) => {
            context.assignedHousekeeper = undefined;
            context.startedAt = undefined;
          },
          resetRoomState: (context) => {
            context.assignedHousekeeper = undefined;
            context.startedAt = undefined;
            context.completedTasks = [];
            context.issues = [];
            context.inspectedBy = undefined;
            context.inspectionNotes = undefined;
          },
          clearIssues: (context) => {
            context.issues = [];
          },
          clearMaintenanceFlags: (context) => {
            context.specialInstructions = undefined;
          },
        },
      }
    );
  }

  async initializeRoomStateMachine(
    roomId: string,
    roomNumber: string,
    currentStatus?: RoomCleaningStatus
  ): Promise<void> {
    const context: RoomStateMachineContext = {
      roomId,
      roomNumber,
      priority: 'normal',
    };

    const machine = this.createRoomStateMachine(context);
    const service = interpret(machine);

    // Restore state if provided
    if (currentStatus) {
      const restoredState = machine.resolveState({
        value: currentStatus,
        context,
      } as State<RoomStateMachineContext>);

      service.start(restoredState);
    } else {
      service.start();
    }

    // Subscribe to state changes
    service.onTransition((state) => {
      this.handleStateTransition(roomId, state);
    });

    this.machines.set(roomId, service);
    this.logger.log(
      `Initialized state machine for room ${roomNumber} (${roomId})`
    );
  }

  async sendEvent(
    roomId: string,
    event: CleaningEvent,
    data?: any
  ): Promise<RoomCleaningStatus> {
    const machine = this.machines.get(roomId);
    if (!machine) {
      throw new Error(`No state machine found for room ${roomId}`);
    }

    machine.send({ type: event, ...data });
    return machine.state.value as RoomCleaningStatus;
  }

  getCurrentState(roomId: string): RoomCleaningStatus | undefined {
    const machine = this.machines.get(roomId);
    return machine?.state.value as RoomCleaningStatus;
  }

  getContext(roomId: string): RoomStateMachineContext | undefined {
    const machine = this.machines.get(roomId);
    return machine?.state.context;
  }

  async getAllRoomStates(): Promise<
    Map<
      string,
      { status: RoomCleaningStatus; context: RoomStateMachineContext }
    >
  > {
    const states = new Map();

    for (const [roomId, machine] of this.machines) {
      states.set(roomId, {
        status: machine.state.value,
        context: machine.state.context,
      });
    }

    return states;
  }

  async getRoomsByStatus(
    status: RoomCleaningStatus
  ): Promise<Array<{ roomId: string; context: RoomStateMachineContext }>> {
    const rooms = [];

    for (const [roomId, machine] of this.machines) {
      if (machine.state.value === status) {
        rooms.push({
          roomId,
          context: machine.state.context,
        });
      }
    }

    return rooms;
  }

  async getCleaningQueue(): Promise<
    Array<{
      roomId: string;
      context: RoomStateMachineContext;
      priority: number;
    }>
  > {
    const dirtyRooms = await this.getRoomsByStatus(RoomCleaningStatus.DIRTY);

    // Sort by priority and check-in time
    return dirtyRooms
      .map((room) => ({
        ...room,
        priority: this.calculatePriority(room.context),
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  private calculatePriority(context: RoomStateMachineContext): number {
    let priority = 0;

    // Base priority
    switch (context.priority) {
      case 'urgent':
        priority += 100;
        break;
      case 'high':
        priority += 75;
        break;
      case 'normal':
        priority += 50;
        break;
      case 'low':
        priority += 25;
        break;
    }

    // Add urgency based on time since checkout (if applicable)
    // This would need integration with reservation data

    return priority;
  }

  private async handleStateTransition(
    roomId: string,
    state: State<RoomStateMachineContext>
  ): Promise<void> {
    const status = state.value as RoomCleaningStatus;
    const context = state.context;

    try {
      // Update database
      await this.updateRoomStatusInDatabase(roomId, status, context);

      // Store state in Redis for persistence
      await this.persistState(roomId, status, context);

      // Log transition
      this.logger.log(`Room ${context.roomNumber} transitioned to ${status}`);

      // Emit events for other services
      await this.emitStateChangeEvent(roomId, status, context);
    } catch (error) {
      this.logger.error(
        `Failed to handle state transition for room ${roomId}:`,
        error
      );
    }
  }

  private async updateRoomStatusInDatabase(
    roomId: string,
    status: RoomCleaningStatus,
    context: RoomStateMachineContext
  ): Promise<void> {
    await this.prisma.room.update({
      where: { id: roomId },
      data: {
        status: this.mapCleaningStatusToRoomStatus(status),
        lastCleaned:
          status === RoomCleaningStatus.CLEAN ? new Date() : undefined,
      },
    });
  }

  private mapCleaningStatusToRoomStatus(
    cleaningStatus: RoomCleaningStatus
  ): string {
    switch (cleaningStatus) {
      case RoomCleaningStatus.CLEAN:
        return 'AVAILABLE';
      case RoomCleaningStatus.DIRTY:
        return 'CLEANING';
      case RoomCleaningStatus.CLEANING:
        return 'CLEANING';
      case RoomCleaningStatus.INSPECTING:
        return 'CLEANING';
      case RoomCleaningStatus.OUT_OF_ORDER:
        return 'OUT_OF_ORDER';
      case RoomCleaningStatus.MAINTENANCE:
        return 'MAINTENANCE';
      default:
        return 'AVAILABLE';
    }
  }

  private async persistState(
    roomId: string,
    status: RoomCleaningStatus,
    context: RoomStateMachineContext
  ): Promise<void> {
    const key = `room:state:${roomId}`;
    const stateData = {
      status,
      context,
      updatedAt: new Date(),
    };

    await this.redis.set(key, JSON.stringify(stateData));
  }

  private async emitStateChangeEvent(
    roomId: string,
    status: RoomCleaningStatus,
    context: RoomStateMachineContext
  ): Promise<void> {
    const event = {
      type: 'ROOM_STATUS_CHANGED',
      roomId,
      roomNumber: context.roomNumber,
      status,
      context,
      timestamp: new Date(),
    };

    // Publish to Redis pub/sub
    await this.redis.publish('housekeeping:events', JSON.stringify(event));
  }

  async stopStateMachine(roomId: string): Promise<void> {
    const machine = this.machines.get(roomId);
    if (machine) {
      machine.stop();
      this.machines.delete(roomId);
    }
  }

  async stopAllStateMachines(): Promise<void> {
    for (const [roomId, machine] of this.machines) {
      machine.stop();
    }
    this.machines.clear();
  }
}
