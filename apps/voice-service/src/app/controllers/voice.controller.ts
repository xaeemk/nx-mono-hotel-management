import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
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
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname } from 'path';
import {
  VoiceTranscriptionDto,
  IntentDetectionDto,
  IntentResult,
  VoiceSessionDto,
  GenerateTtsDto,
  MCPPipelineDto,
} from '../dto/voice.dto';
import { WhisperService } from '../services/whisper.service';
import { IntentRouterService } from '../services/intent-router.service';
import { TtsService } from '../services/tts.service';
import { VoiceSessionService } from '../services/voice-session.service';
import { MCPPipelineService } from '../services/mcp-pipeline.service';
import { environment } from '../../environments/environment';

@ApiTags('voice')
@Controller('voice')
export class VoiceController {
  private readonly logger = new Logger(VoiceController.name);

  constructor(
    private readonly whisperService: WhisperService,
    private readonly intentRouterService: IntentRouterService,
    private readonly ttsService: TtsService,
    private readonly voiceSessionService: VoiceSessionService,
    private readonly mcpPipelineService: MCPPipelineService
  ) {}

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: diskStorage({
        destination: environment.storage.audioPath,
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `audio-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: environment.storage.maxFileSize,
      },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(mp3|wav|m4a|mp4|mpeg|mpga|webm)$/)) {
          return callback(new Error('Only audio files are allowed'), false);
        }
        callback(null, true);
      },
    })
  )
  @ApiOperation({ summary: 'Transcribe audio using Whisper STT' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio file to transcribe',
        },
        callSid: {
          type: 'string',
          description: 'Call ID for session tracking',
        },
        language: {
          type: 'string',
          description: 'Language code (optional)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Transcription result',
    schema: {
      type: 'object',
      properties: {
        transcript: { type: 'string' },
        language: { type: 'string' },
        confidence: { type: 'number' },
        duration: { type: 'number' },
      },
    },
  })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { callSid: string; language?: string }
  ) {
    this.logger.log(`Transcribing audio for call: ${body.callSid}`);

    if (!file) {
      return { error: 'Audio file is required' };
    }

    try {
      const transcription = await this.whisperService.transcribeAudio({
        audioPath: file.path,
        language: body.language,
        callSid: body.callSid,
      });

      // Store transcription in session
      await this.voiceSessionService.addInteraction(body.callSid, {
        timestamp: new Date().toISOString(),
        speaker: 'guest',
        message: transcription.transcript,
        transcriptionData: {
          language: transcription.language,
          confidence: transcription.confidence,
          duration: transcription.duration,
        },
      });

      return transcription;
    } catch (error) {
      this.logger.error(`Transcription failed: ${error.message}`, error.stack);
      return { error: error.message };
    }
  }

  @Post('intent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detect intent from transcript using OpenAI functions',
  })
  @ApiBody({ type: IntentDetectionDto })
  @ApiResponse({
    status: 200,
    description: 'Intent detection result',
    type: IntentResult,
  })
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async detectIntent(
    @Body() intentData: IntentDetectionDto
  ): Promise<IntentResult> {
    this.logger.log(`Detecting intent for call: ${intentData.callSid}`);

    try {
      const result = await this.intentRouterService.detectIntent(intentData);

      // Store intent result in session
      await this.voiceSessionService.addInteraction(intentData.callSid, {
        timestamp: new Date().toISOString(),
        speaker: 'assistant',
        message: result.response || 'Intent detected',
        intent: result.intent,
        confidence: result.confidence,
        parameters: result.parameters,
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Intent detection failed: ${error.message}`,
        error.stack
      );
      return {
        intent: 'general_inquiry' as any,
        confidence: 0,
        response:
          'I apologize, I had trouble understanding your request. Could you please rephrase?',
      };
    }
  }

  @Post('tts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate text-to-speech audio' })
  @ApiBody({ type: GenerateTtsDto })
  @ApiResponse({
    status: 200,
    description: 'TTS generation result',
    schema: {
      type: 'object',
      properties: {
        audioUrl: { type: 'string' },
        duration: { type: 'number' },
        size: { type: 'number' },
      },
    },
  })
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async generateTts(@Body() ttsData: GenerateTtsDto) {
    this.logger.log(`Generating TTS for call: ${ttsData.callSid}`);

    try {
      const result = await this.ttsService.generateSpeech(ttsData);

      // Store TTS generation in session
      await this.voiceSessionService.addInteraction(ttsData.callSid, {
        timestamp: new Date().toISOString(),
        speaker: 'assistant',
        message: ttsData.text,
        ttsData: {
          voice: ttsData.voice,
          language: ttsData.language,
          audioUrl: result.audioUrl,
          duration: result.duration,
        },
      });

      return result;
    } catch (error) {
      this.logger.error(`TTS generation failed: ${error.message}`, error.stack);
      return { error: error.message };
    }
  }

  @Post('mcp-pipeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger MCP pipeline processing' })
  @ApiBody({ type: MCPPipelineDto })
  @ApiResponse({
    status: 200,
    description: 'MCP pipeline result',
    schema: {
      type: 'object',
      properties: {
        pipelineId: { type: 'string' },
        status: { type: 'string' },
        estimatedCompletion: { type: 'string' },
      },
    },
  })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async triggerMCPPipeline(@Body() pipelineData: MCPPipelineDto) {
    this.logger.log(
      `Triggering MCP pipeline for call: ${pipelineData.callSid}, intent: ${pipelineData.intent}`
    );

    try {
      const result = await this.mcpPipelineService.processPipeline(
        pipelineData
      );

      return {
        pipelineId: result.id,
        status: result.status,
        estimatedCompletion: result.estimatedCompletion,
      };
    } catch (error) {
      this.logger.error(`MCP pipeline failed: ${error.message}`, error.stack);
      return { error: error.message };
    }
  }

  @Get('session/:callSid')
  @ApiOperation({ summary: 'Get voice session details' })
  @ApiParam({ name: 'callSid', description: 'Call SID' })
  @ApiResponse({
    status: 200,
    description: 'Voice session details',
    type: VoiceSessionDto,
  })
  async getSession(@Param('callSid') callSid: string) {
    this.logger.log(`Getting session for call: ${callSid}`);

    try {
      const session = await this.voiceSessionService.getSession(callSid);
      return session;
    } catch (error) {
      this.logger.error(`Failed to get session: ${error.message}`, error.stack);
      return { error: error.message };
    }
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List voice sessions' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Limit number of results',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: 'number',
    description: 'Offset for pagination',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: 'string',
    description: 'Filter by status',
  })
  async listSessions(
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
    @Query('status') status?: string
  ) {
    this.logger.log(
      `Listing sessions: limit=${limit}, offset=${offset}, status=${status}`
    );

    try {
      const sessions = await this.voiceSessionService.listSessions({
        limit: Math.min(limit, 100), // Cap at 100
        offset,
        status,
      });
      return sessions;
    } catch (error) {
      this.logger.error(
        `Failed to list sessions: ${error.message}`,
        error.stack
      );
      return { error: error.message };
    }
  }

  @Get('analytics/summary')
  @ApiOperation({ summary: 'Get voice service analytics summary' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['hour', 'day', 'week', 'month'],
    description: 'Time period',
  })
  async getAnalyticsSummary(@Query('period') period: string = 'day') {
    this.logger.log(`Getting analytics summary for period: ${period}`);

    try {
      const analytics = await this.voiceSessionService.getAnalyticsSummary(
        period
      );
      return analytics;
    } catch (error) {
      this.logger.error(
        `Failed to get analytics: ${error.message}`,
        error.stack
      );
      return { error: error.message };
    }
  }
}
