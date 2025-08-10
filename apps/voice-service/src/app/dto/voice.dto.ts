import {
  IsString,
  IsOptional,
  IsPhoneNumber,
  IsEnum,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum VoiceCallStatus {
  INITIATED = 'initiated',
  RINGING = 'ringing',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  NO_ANSWER = 'no-answer',
  BUSY = 'busy',
  CANCELED = 'canceled',
}

export enum IntentType {
  MAKE_RESERVATION = 'make_reservation',
  CHECK_AVAILABILITY = 'check_availability',
  MODIFY_RESERVATION = 'modify_reservation',
  CANCEL_RESERVATION = 'cancel_reservation',
  INQUIRE_AMENITIES = 'inquire_amenities',
  CHECK_IN_STATUS = 'check_in_status',
  ROOM_SERVICE = 'room_service',
  HOUSEKEEPING_REQUEST = 'housekeeping_request',
  COMPLAINT = 'complaint',
  GENERAL_INQUIRY = 'general_inquiry',
  TRANSFER_HUMAN = 'transfer_human',
}

export class TwilioWebhookDto {
  @ApiProperty()
  @IsString()
  CallSid: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  From?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  To?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  CallStatus?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  Direction?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  RecordingUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  RecordingSid?: string;
}

export class VoiceTranscriptionDto {
  @ApiProperty()
  @IsString()
  callSid: string;

  @ApiProperty()
  @IsString()
  audioUrl: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  language?: string;
}

export class IntentDetectionDto {
  @ApiProperty()
  @IsString()
  transcript: string;

  @ApiProperty()
  @IsString()
  callSid: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  conversationContext?: string;
}

export class IntentResult {
  @ApiProperty({ enum: IntentType })
  @IsEnum(IntentType)
  intent: IntentType;

  @ApiProperty()
  confidence: number;

  @ApiPropertyOptional()
  @IsOptional()
  parameters?: Record<string, any>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  response?: string;

  @ApiPropertyOptional()
  @IsOptional()
  nextAction?: {
    type: 'transfer' | 'continue' | 'end' | 'collect_info';
    data?: any;
  };
}

export class VoiceSessionDto {
  @ApiProperty()
  @IsString()
  sessionId: string;

  @ApiProperty()
  @IsString()
  callSid: string;

  @ApiProperty()
  @IsPhoneNumber()
  phoneNumber: string;

  @ApiPropertyOptional()
  @IsOptional()
  guestInfo?: {
    name?: string;
    email?: string;
    reservationNumber?: string;
  };

  @ApiPropertyOptional()
  @IsOptional()
  conversationHistory?: Array<{
    timestamp: string;
    speaker: 'guest' | 'assistant';
    message: string;
    intent?: IntentType;
  }>;
}

export class GenerateTtsDto {
  @ApiProperty()
  @IsString()
  text: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  voice?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  language?: string;

  @ApiProperty()
  @IsString()
  callSid: string;
}

export class MCPPipelineDto {
  @ApiProperty()
  @IsString()
  callSid: string;

  @ApiProperty({ enum: IntentType })
  @IsEnum(IntentType)
  intent: IntentType;

  @ApiProperty()
  @IsOptional()
  parameters?: Record<string, any>;

  @ApiProperty()
  @IsString()
  originalMessage: string;

  @ApiPropertyOptional()
  @IsOptional()
  responseChannels?: Array<'voice' | 'sms' | 'whatsapp' | 'email'>;
}
