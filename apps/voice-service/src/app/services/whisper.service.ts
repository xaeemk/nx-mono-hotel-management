import { Injectable, Logger } from '@nestjs/common';
import { createReadStream, unlinkSync, existsSync } from 'fs';
import { OpenAI } from 'openai';
import { environment } from '../../environments/environment';

export interface TranscriptionOptions {
  audioPath: string;
  language?: string;
  callSid: string;
  prompt?: string;
}

export interface TranscriptionResult {
  transcript: string;
  language: string;
  confidence: number;
  duration: number;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
}

@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: environment.openai.apiKey,
    });
  }

  async transcribeAudio(
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const { audioPath, language, callSid, prompt } = options;

    this.logger.log(
      `Transcribing audio file: ${audioPath} for call: ${callSid}`
    );

    if (!existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    try {
      // Create file stream
      const audioStream = createReadStream(audioPath);

      // Get file stats for duration estimation (approximate)
      const stats = require('fs').statSync(audioPath);
      const fileSizeKB = stats.size / 1024;

      // Rough estimation: 1MB ≈ 8 minutes of audio at 16kbps
      const estimatedDuration = (fileSizeKB / 1024) * 8 * 60;

      // Prepare transcription parameters
      const transcriptionParams: any = {
        file: audioStream,
        model: environment.openai.whisperModel,
        response_format: 'verbose_json',
        temperature: 0.2,
      };

      // Add language if specified
      if (language) {
        transcriptionParams.language = language;
      }

      // Add prompt for better context (hotel-specific terms)
      if (prompt) {
        transcriptionParams.prompt = prompt;
      } else {
        // Default hotel industry prompt for better recognition
        transcriptionParams.prompt =
          'This is a phone call to a hotel. Common terms include: reservation, booking, check-in, check-out, room service, housekeeping, amenities, concierge, front desk, availability, rates, cancellation.';
      }

      // Perform transcription
      this.logger.log(`Starting Whisper transcription for call: ${callSid}`);
      const startTime = Date.now();

      const response = await this.openai.audio.transcriptions.create(
        transcriptionParams
      );

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Whisper transcription completed in ${processingTime}ms for call: ${callSid}`
      );

      // Parse response
      const transcript = response.text;
      const detectedLanguage = response.language || language || 'en';

      // Extract segments if available
      let segments: any[] = [];
      if (response.segments) {
        segments = response.segments.map((segment: any) => ({
          text: segment.text,
          start: segment.start,
          end: segment.end,
          confidence: segment.avg_logprob
            ? Math.exp(segment.avg_logprob)
            : undefined,
        }));
      }

      // Calculate average confidence from segments
      let averageConfidence = 0.85; // Default confidence
      if (segments.length > 0) {
        const confidenceValues = segments
          .map((s) => s.confidence)
          .filter((c) => c !== undefined);

        if (confidenceValues.length > 0) {
          averageConfidence =
            confidenceValues.reduce((sum, conf) => sum + conf, 0) /
            confidenceValues.length;
        }
      }

      const result: TranscriptionResult = {
        transcript: transcript.trim(),
        language: detectedLanguage,
        confidence: averageConfidence,
        duration: estimatedDuration,
        segments: segments.length > 0 ? segments : undefined,
      };

      // Log transcription results
      this.logger.log(
        `Transcription result for ${callSid}: "${transcript.substring(0, 100)}${
          transcript.length > 100 ? '...' : ''
        }" (${detectedLanguage}, confidence: ${averageConfidence.toFixed(2)})`
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Whisper transcription failed for call ${callSid}: ${error.message}`,
        error.stack
      );
      throw new Error(`Transcription failed: ${error.message}`);
    } finally {
      // Clean up temporary audio file
      try {
        if (existsSync(audioPath)) {
          unlinkSync(audioPath);
          this.logger.debug(`Cleaned up audio file: ${audioPath}`);
        }
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to clean up audio file ${audioPath}: ${cleanupError.message}`
        );
      }
    }
  }

  /**
   * Batch process multiple audio files for transcription
   */
  async batchTranscribe(
    audioFiles: TranscriptionOptions[]
  ): Promise<TranscriptionResult[]> {
    this.logger.log(
      `Starting batch transcription for ${audioFiles.length} files`
    );

    const results: TranscriptionResult[] = [];

    // Process files in parallel with concurrency limit
    const concurrencyLimit = 3;
    for (let i = 0; i < audioFiles.length; i += concurrencyLimit) {
      const batch = audioFiles.slice(i, i + concurrencyLimit);

      const batchPromises = batch.map(async (options) => {
        try {
          return await this.transcribeAudio(options);
        } catch (error) {
          this.logger.error(
            `Batch transcription failed for ${options.callSid}: ${error.message}`
          );
          return {
            transcript: '',
            language: 'en',
            confidence: 0,
            duration: 0,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    this.logger.log(
      `Batch transcription completed: ${results.length} files processed`
    );
    return results;
  }

  /**
   * Validate audio file format and size
   */
  validateAudioFile(audioPath: string): { valid: boolean; error?: string } {
    try {
      if (!existsSync(audioPath)) {
        return { valid: false, error: 'Audio file does not exist' };
      }

      const stats = require('fs').statSync(audioPath);

      // Check file size (max 25MB for Whisper API)
      const maxSizeBytes = 25 * 1024 * 1024;
      if (stats.size > maxSizeBytes) {
        return {
          valid: false,
          error: `File too large: ${Math.round(
            stats.size / (1024 * 1024)
          )}MB (max 25MB)`,
        };
      }

      // Check minimum size (at least 1KB)
      if (stats.size < 1024) {
        return { valid: false, error: 'File too small (minimum 1KB)' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: `File validation error: ${error.message}` };
    }
  }

  /**
   * Get supported languages for transcription
   */
  getSupportedLanguages(): string[] {
    return [
      'af',
      'am',
      'ar',
      'as',
      'az',
      'ba',
      'be',
      'bg',
      'bn',
      'bo',
      'br',
      'bs',
      'ca',
      'cs',
      'cy',
      'da',
      'de',
      'el',
      'en',
      'es',
      'et',
      'eu',
      'fa',
      'fi',
      'fo',
      'fr',
      'gl',
      'gu',
      'ha',
      'haw',
      'he',
      'hi',
      'hr',
      'ht',
      'hu',
      'hy',
      'id',
      'is',
      'it',
      'ja',
      'jw',
      'ka',
      'kk',
      'km',
      'kn',
      'ko',
      'la',
      'lb',
      'ln',
      'lo',
      'lt',
      'lv',
      'mg',
      'mi',
      'mk',
      'ml',
      'mn',
      'mr',
      'ms',
      'mt',
      'my',
      'ne',
      'nl',
      'nn',
      'no',
      'oc',
      'pa',
      'pl',
      'ps',
      'pt',
      'ro',
      'ru',
      'sa',
      'sd',
      'si',
      'sk',
      'sl',
      'sn',
      'so',
      'sq',
      'sr',
      'su',
      'sv',
      'sw',
      'ta',
      'te',
      'tg',
      'th',
      'tk',
      'tl',
      'tr',
      'tt',
      'uk',
      'ur',
      'uz',
      'vi',
      'yi',
      'yo',
      'zh',
    ];
  }
}
