import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  Logger,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TwilioWebhookDto } from '../dto/voice.dto';
import { VoiceCallService } from '../services/voice-call.service';
import { VoiceSessionService } from '../services/voice-session.service';
import { WhisperService } from '../services/whisper.service';
import { IntentRouterService } from '../services/intent-router.service';
import { MCPPipelineService } from '../services/mcp-pipeline.service';

@ApiTags('twilio')
@Controller('twilio')
export class TwilioController {
  private readonly logger = new Logger(TwilioController.name);

  constructor(
    private readonly voiceCallService: VoiceCallService,
    private readonly voiceSessionService: VoiceSessionService,
    private readonly whisperService: WhisperService,
    private readonly intentRouterService: IntentRouterService,
    private readonly mcpPipelineService: MCPPipelineService,
    @InjectQueue('voice-processing') private voiceQueue: Queue
  ) {}

  @Post('voice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle incoming Twilio voice calls' })
  @ApiBody({ type: TwilioWebhookDto })
  @ApiResponse({ status: 200, description: 'TwiML response for call handling' })
  @Throttle({ default: { limit: 50, ttl: 60000 } })
  async handleVoiceCall(@Body() twilioData: TwilioWebhookDto) {
    this.logger.log(`Incoming voice call: ${JSON.stringify(twilioData)}`);

    try {
      // Create or update voice session
      const session = await this.voiceSessionService.createOrUpdateSession({
        callSid: twilioData.CallSid,
        phoneNumber: twilioData.From || '',
        status: twilioData.CallStatus || 'initiated',
        direction: twilioData.Direction || 'inbound',
      });

      // Generate initial TwiML response
      const twimlResponse = await this.voiceCallService.generateInitialTwiML(
        twilioData.CallSid,
        twilioData.From || ''
      );

      return twimlResponse;
    } catch (error) {
      this.logger.error(
        `Error handling voice call: ${error.message}`,
        error.stack
      );

      // Return fallback TwiML
      return `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice" language="en-US">
            I'm sorry, we're experiencing technical difficulties. Please try again later or contact our front desk directly.
          </Say>
          <Hangup/>
        </Response>`;
    }
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Twilio call status updates' })
  @ApiBody({ type: TwilioWebhookDto })
  async handleCallStatus(@Body() twilioData: TwilioWebhookDto) {
    this.logger.log(`Call status update: ${JSON.stringify(twilioData)}`);

    try {
      await this.voiceSessionService.updateCallStatus(
        twilioData.CallSid,
        twilioData.CallStatus || 'unknown'
      );

      return { status: 'ok' };
    } catch (error) {
      this.logger.error(
        `Error handling call status: ${error.message}`,
        error.stack
      );
      return { status: 'error', message: error.message };
    }
  }

  @Post('recording')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Twilio recording webhooks' })
  @ApiBody({ type: TwilioWebhookDto })
  async handleRecording(@Body() twilioData: TwilioWebhookDto) {
    this.logger.log(`Recording webhook: ${JSON.stringify(twilioData)}`);

    if (!twilioData.RecordingUrl) {
      throw new BadRequestException('Recording URL is required');
    }

    try {
      // Queue the recording for processing
      await this.voiceQueue.add(
        'process-recording',
        {
          callSid: twilioData.CallSid,
          recordingUrl: twilioData.RecordingUrl,
          recordingSid: twilioData.RecordingSid,
          timestamp: new Date().toISOString(),
        },
        {
          priority: 1, // High priority for recording processing
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      return { status: 'queued' };
    } catch (error) {
      this.logger.error(
        `Error handling recording: ${error.message}`,
        error.stack
      );
      return { status: 'error', message: error.message };
    }
  }

  @Post('gather')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Twilio Gather input (voice or DTMF)' })
  @ApiBody({ type: TwilioWebhookDto })
  async handleGather(@Body() twilioData: any) {
    this.logger.log(`Gather input: ${JSON.stringify(twilioData)}`);

    try {
      const callSid = twilioData.CallSid;
      const speechResult = twilioData.SpeechResult;
      const digits = twilioData.Digits;

      let inputText = '';
      let inputType = '';

      if (speechResult) {
        inputText = speechResult;
        inputType = 'speech';
      } else if (digits) {
        inputText = digits;
        inputType = 'dtmf';
      }

      if (!inputText) {
        // No input received, ask again
        return await this.voiceCallService.generateNoInputTwiML(callSid);
      }

      // Process the input through intent router
      const intentResult = await this.intentRouterService.detectIntent({
        transcript: inputText,
        callSid,
        conversationContext:
          await this.voiceSessionService.getConversationContext(callSid),
      });

      // Update session with the interaction
      await this.voiceSessionService.addInteraction(callSid, {
        timestamp: new Date().toISOString(),
        speaker: 'guest',
        message: inputText,
        intent: intentResult.intent,
        inputType,
      });

      // Generate appropriate TwiML response
      let twimlResponse = '';

      if (intentResult.nextAction?.type === 'transfer') {
        twimlResponse = await this.voiceCallService.generateTransferTwiML(
          callSid,
          intentResult.nextAction.data
        );
      } else if (intentResult.nextAction?.type === 'end') {
        twimlResponse = await this.voiceCallService.generateEndCallTwiML(
          callSid,
          intentResult.response || 'Thank you for calling. Goodbye!'
        );
      } else if (intentResult.nextAction?.type === 'collect_info') {
        twimlResponse = await this.voiceCallService.generateCollectInfoTwiML(
          callSid,
          intentResult.nextAction.data
        );
      } else {
        // Continue conversation
        twimlResponse = await this.voiceCallService.generateContinueTwiML(
          callSid,
          intentResult.response || 'I understand. How else can I help you?'
        );
      }

      // Trigger MCP pipeline for complex intents
      if (this.shouldTriggerMCPPipeline(intentResult.intent)) {
        await this.voiceQueue.add(
          'mcp-pipeline',
          {
            callSid,
            intent: intentResult.intent,
            parameters: intentResult.parameters,
            originalMessage: inputText,
            responseChannels: ['voice'], // Default to voice response
          },
          {
            priority: 2,
            attempts: 2,
          }
        );
      }

      return twimlResponse;
    } catch (error) {
      this.logger.error(`Error handling gather: ${error.message}`, error.stack);

      // Return error TwiML
      return await this.voiceCallService.generateErrorTwiML(
        twilioData.CallSid,
        'I apologize, I had trouble understanding. Could you please try again?'
      );
    }
  }

  @Post('conference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Twilio conference events' })
  async handleConference(@Body() twilioData: any) {
    this.logger.log(`Conference event: ${JSON.stringify(twilioData)}`);

    try {
      // Handle conference events (join, leave, etc.)
      const event = twilioData.StatusCallbackEvent;
      const callSid = twilioData.CallSid;
      const conferenceName = twilioData.FriendlyName;

      await this.voiceSessionService.addInteraction(callSid, {
        timestamp: new Date().toISOString(),
        speaker: 'system',
        message: `Conference event: ${event}`,
        conferenceInfo: {
          name: conferenceName,
          event,
        },
      });

      return { status: 'ok' };
    } catch (error) {
      this.logger.error(
        `Error handling conference: ${error.message}`,
        error.stack
      );
      return { status: 'error', message: error.message };
    }
  }

  private shouldTriggerMCPPipeline(intent: string): boolean {
    // Intents that require complex backend processing
    const mcpIntents = [
      'make_reservation',
      'modify_reservation',
      'cancel_reservation',
      'check_availability',
      'room_service',
      'housekeeping_request',
    ];

    return mcpIntents.includes(intent);
  }
}
