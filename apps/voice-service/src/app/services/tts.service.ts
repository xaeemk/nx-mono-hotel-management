import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { GenerateTtsDto } from '../dto/voice.dto';
import { environment } from '../../environments/environment';

export interface TtsResult {
  audioUrl: string;
  audioPath: string;
  duration: number;
  size: number;
  format: string;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: environment.openai.apiKey,
    });

    // Ensure audio storage directory exists
    if (!existsSync(environment.storage.audioPath)) {
      mkdirSync(environment.storage.audioPath, { recursive: true });
    }
  }

  async generateSpeech(data: GenerateTtsDto): Promise<TtsResult> {
    const { text, voice, language, callSid } = data;

    this.logger.log(
      `Generating TTS for call ${callSid}: "${text.substring(0, 50)}..."`
    );

    try {
      // Generate unique filename
      const timestamp = Date.now();
      const filename = `tts-${callSid}-${timestamp}.mp3`;
      const audioPath = join(environment.storage.audioPath, filename);

      // Generate speech using OpenAI TTS
      const mp3 = await this.openai.audio.speech.create({
        model: environment.openai.ttsModel,
        voice: (voice || environment.openai.ttsVoice) as any,
        input: text,
        response_format: 'mp3',
        speed: 1.0,
      });

      // Convert response to buffer
      const buffer = Buffer.from(await mp3.arrayBuffer());

      // Write audio file
      writeFileSync(audioPath, buffer);

      // Get file stats
      const stats = require('fs').statSync(audioPath);
      const fileSizeBytes = stats.size;

      // Estimate duration (rough: 1 character ≈ 0.05 seconds for normal speech)
      const estimatedDuration = Math.max(text.length * 0.05, 1);

      const result: TtsResult = {
        audioUrl: `/api/v1/voice/audio/${filename}`,
        audioPath,
        duration: estimatedDuration,
        size: fileSizeBytes,
        format: 'mp3',
      };

      this.logger.log(
        `TTS generated for call ${callSid}: ${filename} (${fileSizeBytes} bytes, ~${estimatedDuration.toFixed(
          1
        )}s)`
      );

      return result;
    } catch (error) {
      this.logger.error(
        `TTS generation failed for call ${callSid}: ${error.message}`,
        error.stack
      );
      throw new Error(`TTS generation failed: ${error.message}`);
    }
  }

  /**
   * Generate TwiML-compatible TTS for Twilio
   */
  async generateTwiMLSpeech(text: string, callSid: string): Promise<string> {
    try {
      const ttsResult = await this.generateSpeech({
        text,
        callSid,
        voice: environment.openai.ttsVoice,
      });

      // Return TwiML Play element with the generated audio URL
      return `<Play>${environment.twilio.webhookUrl.replace(
        '/twilio/voice',
        ''
      )}${ttsResult.audioUrl}</Play>`;
    } catch (error) {
      this.logger.error(
        `TwiML TTS generation failed for call ${callSid}: ${error.message}`
      );

      // Fallback to Say element
      return `<Say voice="alice" language="en-US">${this.escapeTwiMLText(
        text
      )}</Say>`;
    }
  }

  /**
   * Batch generate multiple TTS files
   */
  async batchGenerateSpeech(requests: GenerateTtsDto[]): Promise<TtsResult[]> {
    this.logger.log(
      `Starting batch TTS generation for ${requests.length} requests`
    );

    const results: TtsResult[] = [];
    const concurrencyLimit = 3;

    for (let i = 0; i < requests.length; i += concurrencyLimit) {
      const batch = requests.slice(i, i + concurrencyLimit);

      const batchPromises = batch.map(async (request) => {
        try {
          return await this.generateSpeech(request);
        } catch (error) {
          this.logger.error(
            `Batch TTS failed for ${request.callSid}: ${error.message}`
          );
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(
        ...(batchResults.filter((result) => result !== null) as TtsResult[])
      );
    }

    this.logger.log(
      `Batch TTS generation completed: ${results.length} files generated`
    );
    return results;
  }

  /**
   * Get available TTS voices
   */
  getAvailableVoices(): Array<{
    id: string;
    name: string;
    gender: string;
    language: string;
  }> {
    return [
      { id: 'alloy', name: 'Alloy', gender: 'neutral', language: 'en-US' },
      { id: 'echo', name: 'Echo', gender: 'male', language: 'en-US' },
      { id: 'fable', name: 'Fable', gender: 'female', language: 'en-US' },
      { id: 'onyx', name: 'Onyx', gender: 'male', language: 'en-US' },
      { id: 'nova', name: 'Nova', gender: 'female', language: 'en-US' },
      { id: 'shimmer', name: 'Shimmer', gender: 'female', language: 'en-US' },
    ];
  }

  /**
   * Validate TTS input text
   */
  validateTtsInput(text: string): { valid: boolean; error?: string } {
    if (!text || text.trim().length === 0) {
      return { valid: false, error: 'Text cannot be empty' };
    }

    if (text.length > 4000) {
      return { valid: false, error: 'Text too long (max 4000 characters)' };
    }

    // Check for potentially problematic characters
    const problematicChars = /[<>]/g;
    if (problematicChars.test(text)) {
      return { valid: false, error: 'Text contains unsupported characters' };
    }

    return { valid: true };
  }

  /**
   * Clean up old TTS files (for maintenance)
   */
  async cleanupOldFiles(maxAgeHours: number = 24): Promise<number> {
    try {
      const fs = require('fs');
      const path = require('path');

      const files = fs.readdirSync(environment.storage.audioPath);
      const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        if (file.startsWith('tts-') && file.endsWith('.mp3')) {
          const filePath = path.join(environment.storage.audioPath, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      }

      this.logger.log(
        `Cleaned up ${deletedCount} old TTS files (older than ${maxAgeHours}h)`
      );
      return deletedCount;
    } catch (error) {
      this.logger.error(`TTS cleanup failed: ${error.message}`);
      return 0;
    }
  }

  private escapeTwiMLText(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
