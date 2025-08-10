import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import axios from 'axios';
import { MCPPipelineDto, IntentType } from '../dto/voice.dto';
import { REDIS_CLIENT } from '../modules/redis.module';
import { environment } from '../../environments/environment';
import { Redis } from 'ioredis';

export interface PipelineResult {
  id: string;
  status: 'initiated' | 'processing' | 'completed' | 'failed';
  estimatedCompletion: string;
  data?: any;
  responses?: Array<{
    channel: 'voice' | 'sms' | 'whatsapp' | 'email';
    content: string;
    status: 'pending' | 'sent' | 'failed';
  }>;
}

@Injectable()
export class MCPPipelineService {
  private readonly logger = new Logger(MCPPipelineService.name);

  constructor(
    @InjectQueue('mcp-pipeline') private mcpQueue: Queue,
    @Inject(REDIS_CLIENT) private redis: Redis
  ) {}

  async processPipeline(data: MCPPipelineDto): Promise<PipelineResult> {
    const pipelineId = this.generatePipelineId(data.callSid);

    this.logger.log(
      `Starting MCP pipeline ${pipelineId} for intent: ${data.intent}`
    );

    try {
      // Store pipeline metadata in Redis
      const pipelineData = {
        id: pipelineId,
        callSid: data.callSid,
        intent: data.intent,
        parameters: data.parameters,
        originalMessage: data.originalMessage,
        responseChannels: data.responseChannels || ['voice'],
        status: 'initiated',
        createdAt: new Date().toISOString(),
        estimatedCompletion: this.calculateEstimatedCompletion(data.intent),
      };

      await this.redis.setex(
        `pipeline:${pipelineId}`,
        3600, // 1 hour TTL
        JSON.stringify(pipelineData)
      );

      // Queue the pipeline for processing
      await this.mcpQueue.add(
        'process-intent',
        {
          pipelineId,
          ...data,
        },
        {
          priority: this.getIntentPriority(data.intent),
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      return {
        id: pipelineId,
        status: 'initiated',
        estimatedCompletion: pipelineData.estimatedCompletion,
      };
    } catch (error) {
      this.logger.error(
        `Failed to start MCP pipeline: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  async getPipelineStatus(pipelineId: string): Promise<PipelineResult | null> {
    try {
      const data = await this.redis.get(`pipeline:${pipelineId}`);
      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } catch (error) {
      this.logger.error(`Failed to get pipeline status: ${error.message}`);
      return null;
    }
  }

  async updatePipelineStatus(
    pipelineId: string,
    status: PipelineResult['status'],
    data?: any
  ): Promise<void> {
    try {
      const existingData = await this.redis.get(`pipeline:${pipelineId}`);
      if (!existingData) {
        this.logger.warn(`Pipeline ${pipelineId} not found for status update`);
        return;
      }

      const pipeline = JSON.parse(existingData);
      pipeline.status = status;
      pipeline.updatedAt = new Date().toISOString();

      if (data) {
        pipeline.data = data;
      }

      await this.redis.setex(
        `pipeline:${pipelineId}`,
        3600,
        JSON.stringify(pipeline)
      );

      this.logger.log(`Updated pipeline ${pipelineId} status to: ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update pipeline status: ${error.message}`);
    }
  }

  async executeIntentPipeline(
    pipelineId: string,
    data: MCPPipelineDto
  ): Promise<void> {
    this.logger.log(
      `Executing pipeline ${pipelineId} for intent: ${data.intent}`
    );

    try {
      await this.updatePipelineStatus(pipelineId, 'processing');

      let responses: PipelineResult['responses'] = [];

      switch (data.intent) {
        case IntentType.MAKE_RESERVATION:
          responses = await this.handleMakeReservation(data);
          break;

        case IntentType.MODIFY_RESERVATION:
          responses = await this.handleModifyReservation(data);
          break;

        case IntentType.CANCEL_RESERVATION:
          responses = await this.handleCancelReservation(data);
          break;

        case IntentType.CHECK_AVAILABILITY:
          responses = await this.handleCheckAvailability(data);
          break;

        case IntentType.ROOM_SERVICE:
          responses = await this.handleRoomService(data);
          break;

        case IntentType.HOUSEKEEPING_REQUEST:
          responses = await this.handleHousekeepingRequest(data);
          break;

        default:
          responses = await this.handleGeneralInquiry(data);
      }

      // Update pipeline with responses
      await this.updatePipelineStatus(pipelineId, 'completed', { responses });

      // Send responses through appropriate channels
      await this.sendMultiChannelResponses(data.callSid, responses);
    } catch (error) {
      this.logger.error(
        `Pipeline ${pipelineId} execution failed: ${error.message}`,
        error.stack
      );
      await this.updatePipelineStatus(pipelineId, 'failed', {
        error: error.message,
      });
    }
  }

  private async handleMakeReservation(
    data: MCPPipelineDto
  ): Promise<PipelineResult['responses']> {
    const responses: PipelineResult['responses'] = [];

    try {
      // Call reservation service
      const reservationResponse = await axios.post(
        `${environment.services.reservationService}/api/v1/reservations`,
        {
          guestInfo: data.parameters?.guest_info || {},
          dates: data.parameters?.dates || {},
          roomPreferences: data.parameters?.room_preferences || {},
          source: 'voice_assistant',
          callSid: data.callSid,
        }
      );

      if (reservationResponse.data.success) {
        responses.push({
          channel: 'voice',
          content: `Great! I've created your reservation. Your confirmation number is ${reservationResponse.data.confirmationNumber}. You'll receive a confirmation email shortly.`,
          status: 'pending',
        });

        responses.push({
          channel: 'email',
          content: 'reservation_confirmation',
          status: 'pending',
        });

        // Optional SMS confirmation
        if (data.responseChannels?.includes('sms')) {
          responses.push({
            channel: 'sms',
            content: `Hotel Reservation Confirmed! Confirmation #: ${reservationResponse.data.confirmationNumber}. Check-in: ${data.parameters?.dates?.check_in}. Questions? Call us anytime.`,
            status: 'pending',
          });
        }
      } else {
        responses.push({
          channel: 'voice',
          content:
            'I apologize, but I encountered an issue creating your reservation. Let me connect you with our reservations team to assist you further.',
          status: 'pending',
        });
      }
    } catch (error) {
      this.logger.error(`Reservation creation failed: ${error.message}`);
      responses.push({
        channel: 'voice',
        content:
          "I'm sorry, I'm having trouble accessing our reservation system right now. Let me transfer you to a team member who can assist you.",
        status: 'pending',
      });
    }

    return responses;
  }

  private async handleModifyReservation(
    data: MCPPipelineDto
  ): Promise<PipelineResult['responses']> {
    const responses: PipelineResult['responses'] = [];
    const confirmationNumber =
      data.parameters?.reservation_details?.confirmation_number;

    if (!confirmationNumber) {
      responses.push({
        channel: 'voice',
        content:
          'I need your confirmation number to modify your reservation. Could you please provide it?',
        status: 'pending',
      });
      return responses;
    }

    try {
      const modificationResponse = await axios.put(
        `${environment.services.reservationService}/api/v1/reservations/${confirmationNumber}`,
        {
          modifications: data.parameters,
          source: 'voice_assistant',
          callSid: data.callSid,
        }
      );

      if (modificationResponse.data.success) {
        responses.push({
          channel: 'voice',
          content:
            "Perfect! I've updated your reservation. You'll receive an updated confirmation email.",
          status: 'pending',
        });

        responses.push({
          channel: 'email',
          content: 'reservation_modification',
          status: 'pending',
        });
      }
    } catch (error) {
      responses.push({
        channel: 'voice',
        content:
          "I'm having trouble modifying your reservation. Let me connect you with our reservations team.",
        status: 'pending',
      });
    }

    return responses;
  }

  private async handleCancelReservation(
    data: MCPPipelineDto
  ): Promise<PipelineResult['responses']> {
    const responses: PipelineResult['responses'] = [];
    const confirmationNumber =
      data.parameters?.reservation_details?.confirmation_number;

    try {
      const cancellationResponse = await axios.delete(
        `${environment.services.reservationService}/api/v1/reservations/${confirmationNumber}`,
        {
          data: {
            reason: 'guest_request_voice',
            callSid: data.callSid,
          },
        }
      );

      responses.push({
        channel: 'voice',
        content:
          "Your reservation has been cancelled. You'll receive a cancellation confirmation email, and any applicable refunds will be processed according to our cancellation policy.",
        status: 'pending',
      });

      responses.push({
        channel: 'email',
        content: 'reservation_cancellation',
        status: 'pending',
      });
    } catch (error) {
      responses.push({
        channel: 'voice',
        content:
          'I need to verify some details before cancelling your reservation. Let me connect you with our reservations team.',
        status: 'pending',
      });
    }

    return responses;
  }

  private async handleCheckAvailability(
    data: MCPPipelineDto
  ): Promise<PipelineResult['responses']> {
    const responses: PipelineResult['responses'] = [];

    try {
      const availabilityResponse = await axios.get(
        `${environment.services.reservationService}/api/v1/availability`,
        {
          params: {
            checkIn: data.parameters?.dates?.check_in,
            checkOut: data.parameters?.dates?.check_out,
            guests: data.parameters?.guest_info?.adults || 1,
          },
        }
      );

      if (
        availabilityResponse.data.available &&
        availabilityResponse.data.rooms.length > 0
      ) {
        const rooms = availabilityResponse.data.rooms;
        const roomSummary = rooms
          .map((r: any) => `${r.type} room at $${r.rate}/night`)
          .join(', ');

        responses.push({
          channel: 'voice',
          content: `Great news! We have availability for your dates. Available options: ${roomSummary}. Would you like me to make a reservation for you?`,
          status: 'pending',
        });
      } else {
        responses.push({
          channel: 'voice',
          content:
            "I don't see availability for your specific dates, but let me check alternative dates or connect you with our reservations team for more options.",
          status: 'pending',
        });
      }
    } catch (error) {
      responses.push({
        channel: 'voice',
        content:
          'Let me connect you with our reservations team to check availability and assist you with booking options.',
        status: 'pending',
      });
    }

    return responses;
  }

  private async handleRoomService(
    data: MCPPipelineDto
  ): Promise<PipelineResult['responses']> {
    const responses: PipelineResult['responses'] = [];

    responses.push({
      channel: 'voice',
      content:
        "I'll connect you with our room service team who can take your order and provide current menu options.",
      status: 'pending',
    });

    return responses;
  }

  private async handleHousekeepingRequest(
    data: MCPPipelineDto
  ): Promise<PipelineResult['responses']> {
    const responses: PipelineResult['responses'] = [];

    try {
      // Log housekeeping request
      await axios.post(
        `${environment.services.reservationService}/api/v1/housekeeping/requests`,
        {
          roomNumber: data.parameters?.service_request?.room_number,
          requestType: data.parameters?.service_request?.type,
          urgency: data.parameters?.service_request?.urgency || 'medium',
          details: data.parameters?.service_request?.details,
          source: 'voice_assistant',
          callSid: data.callSid,
        }
      );

      responses.push({
        channel: 'voice',
        content:
          "I've logged your housekeeping request. Our housekeeping team will be notified and will assist you as soon as possible.",
        status: 'pending',
      });
    } catch (error) {
      responses.push({
        channel: 'voice',
        content:
          "I've noted your housekeeping request. Let me connect you directly with our housekeeping team to ensure immediate assistance.",
        status: 'pending',
      });
    }

    return responses;
  }

  private async handleGeneralInquiry(
    data: MCPPipelineDto
  ): Promise<PipelineResult['responses']> {
    const responses: PipelineResult['responses'] = [];

    responses.push({
      channel: 'voice',
      content:
        'Let me connect you with one of our team members who can provide detailed information and assist you further.',
      status: 'pending',
    });

    return responses;
  }

  private async sendMultiChannelResponses(
    callSid: string,
    responses: PipelineResult['responses']
  ): Promise<void> {
    for (const response of responses) {
      try {
        if (response.channel === 'voice') {
          // Voice responses are handled by the TwiML flow
          continue;
        }

        if (
          response.channel === 'sms' ||
          response.channel === 'whatsapp' ||
          response.channel === 'email'
        ) {
          await axios.post(
            `${environment.services.notificationService}/api/v1/notifications/send`,
            {
              channel: response.channel,
              content: response.content,
              callSid,
            }
          );
          response.status = 'sent';
        }
      } catch (error) {
        this.logger.error(
          `Failed to send ${response.channel} response: ${error.message}`
        );
        response.status = 'failed';
      }
    }
  }

  private generatePipelineId(callSid: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `pipeline-${callSid}-${timestamp}-${random}`;
  }

  private calculateEstimatedCompletion(intent: IntentType): string {
    const now = new Date();
    let estimatedMinutes = 2; // Default 2 minutes

    switch (intent) {
      case IntentType.MAKE_RESERVATION:
        estimatedMinutes = 5;
        break;
      case IntentType.CHECK_AVAILABILITY:
        estimatedMinutes = 1;
        break;
      case IntentType.MODIFY_RESERVATION:
      case IntentType.CANCEL_RESERVATION:
        estimatedMinutes = 3;
        break;
      case IntentType.ROOM_SERVICE:
      case IntentType.HOUSEKEEPING_REQUEST:
        estimatedMinutes = 1;
        break;
    }

    now.setMinutes(now.getMinutes() + estimatedMinutes);
    return now.toISOString();
  }

  private getIntentPriority(intent: IntentType): number {
    const priorities: Record<IntentType, number> = {
      [IntentType.TRANSFER_HUMAN]: 1, // Highest priority
      [IntentType.COMPLAINT]: 2,
      [IntentType.CANCEL_RESERVATION]: 3,
      [IntentType.MAKE_RESERVATION]: 4,
      [IntentType.MODIFY_RESERVATION]: 5,
      [IntentType.ROOM_SERVICE]: 6,
      [IntentType.HOUSEKEEPING_REQUEST]: 7,
      [IntentType.CHECK_AVAILABILITY]: 8,
      [IntentType.CHECK_IN_STATUS]: 9,
      [IntentType.INQUIRE_AMENITIES]: 10,
      [IntentType.GENERAL_INQUIRY]: 11, // Lowest priority
    };

    return priorities[intent] || 10;
  }
}
