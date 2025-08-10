import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../modules/redis.module';
import { DATABASE_POOL } from '../modules/database.module';
import { Pool } from 'pg';
import { VoiceCallStatus, IntentType } from '../dto/voice.dto';

export interface VoiceSession {
  sessionId: string;
  callSid: string;
  phoneNumber: string;
  status: VoiceCallStatus;
  direction: 'inbound' | 'outbound';
  startTime: string;
  endTime?: string;
  duration?: number;
  guestInfo?: {
    name?: string;
    email?: string;
    reservationNumber?: string;
    isReturningGuest?: boolean;
  };
  conversationHistory: Array<{
    timestamp: string;
    speaker: 'guest' | 'assistant' | 'system';
    message: string;
    intent?: IntentType;
    confidence?: number;
    inputType?: 'speech' | 'dtmf';
    parameters?: any;
    transcriptionData?: any;
    ttsData?: any;
    conferenceInfo?: any;
  }>;
  metadata?: {
    transferredTo?: string;
    transferReason?: string;
    recordingUrl?: string;
    totalInteractions?: number;
    avgResponseTime?: number;
    satisfactionScore?: number;
  };
}

@Injectable()
export class VoiceSessionService {
  private readonly logger = new Logger(VoiceSessionService.name);

  constructor(
    @Inject(REDIS_CLIENT) private redis: Redis,
    @Inject(DATABASE_POOL) private db: Pool
  ) {}

  async createOrUpdateSession(data: {
    callSid: string;
    phoneNumber: string;
    status: string;
    direction: string;
  }): Promise<VoiceSession> {
    const sessionId = this.generateSessionId(data.callSid);
    const existingSession = await this.getSession(data.callSid);

    if (existingSession) {
      // Update existing session
      existingSession.status = data.status as VoiceCallStatus;
      await this.saveSession(existingSession);
      return existingSession;
    }

    // Create new session
    const session: VoiceSession = {
      sessionId,
      callSid: data.callSid,
      phoneNumber: data.phoneNumber,
      status: data.status as VoiceCallStatus,
      direction: data.direction as 'inbound' | 'outbound',
      startTime: new Date().toISOString(),
      conversationHistory: [],
      metadata: {
        totalInteractions: 0,
      },
    };

    // Try to identify returning guest
    await this.identifyGuest(session);

    await this.saveSession(session);
    return session;
  }

  async getSession(callSid: string): Promise<VoiceSession | null> {
    try {
      const sessionData = await this.redis.get(`voice_session:${callSid}`);
      if (!sessionData) {
        return null;
      }

      return JSON.parse(sessionData);
    } catch (error) {
      this.logger.error(`Failed to get session ${callSid}: ${error.message}`);
      return null;
    }
  }

  async saveSession(session: VoiceSession): Promise<void> {
    try {
      // Save to Redis (active session)
      await this.redis.setex(
        `voice_session:${session.callSid}`,
        7200, // 2 hours TTL
        JSON.stringify(session)
      );

      // Also save to database for long-term storage and analytics
      await this.saveSessionToDatabase(session);
    } catch (error) {
      this.logger.error(
        `Failed to save session ${session.callSid}: ${error.message}`
      );
    }
  }

  async addInteraction(
    callSid: string,
    interaction: VoiceSession['conversationHistory'][0]
  ): Promise<void> {
    try {
      const session = await this.getSession(callSid);
      if (!session) {
        this.logger.warn(`Session ${callSid} not found for interaction`);
        return;
      }

      session.conversationHistory.push(interaction);
      session.metadata!.totalInteractions = session.conversationHistory.length;

      // Calculate average response time if applicable
      if (
        interaction.speaker === 'assistant' &&
        session.conversationHistory.length > 1
      ) {
        const prevInteraction =
          session.conversationHistory[session.conversationHistory.length - 2];
        if (prevInteraction.speaker === 'guest') {
          const responseTime =
            new Date(interaction.timestamp).getTime() -
            new Date(prevInteraction.timestamp).getTime();
          session.metadata!.avgResponseTime = session.metadata!.avgResponseTime
            ? (session.metadata!.avgResponseTime + responseTime) / 2
            : responseTime;
        }
      }

      await this.saveSession(session);
    } catch (error) {
      this.logger.error(
        `Failed to add interaction to session ${callSid}: ${error.message}`
      );
    }
  }

  async updateCallStatus(callSid: string, status: string): Promise<void> {
    try {
      const session = await this.getSession(callSid);
      if (!session) {
        this.logger.warn(`Session ${callSid} not found for status update`);
        return;
      }

      session.status = status as VoiceCallStatus;

      if (
        status === 'completed' ||
        status === 'failed' ||
        status === 'no-answer'
      ) {
        session.endTime = new Date().toISOString();
        session.duration = Math.round(
          (new Date(session.endTime).getTime() -
            new Date(session.startTime).getTime()) /
            1000
        );
      }

      await this.saveSession(session);
    } catch (error) {
      this.logger.error(
        `Failed to update call status for ${callSid}: ${error.message}`
      );
    }
  }

  async getConversationContext(callSid: string): Promise<string> {
    try {
      const session = await this.getSession(callSid);
      if (!session || session.conversationHistory.length === 0) {
        return '';
      }

      // Get last 3 interactions for context
      const recentInteractions = session.conversationHistory
        .slice(-3)
        .map((interaction) => `${interaction.speaker}: ${interaction.message}`)
        .join('\n');

      return recentInteractions;
    } catch (error) {
      this.logger.error(
        `Failed to get conversation context for ${callSid}: ${error.message}`
      );
      return '';
    }
  }

  async listSessions(options: {
    limit: number;
    offset: number;
    status?: string;
  }): Promise<{ sessions: VoiceSession[]; total: number }> {
    try {
      let query = `
        SELECT * FROM voice_call_logs 
        WHERE 1=1
      `;
      const params: any[] = [];

      if (options.status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(options.status);
      }

      query += ` ORDER BY start_time DESC LIMIT $${params.length + 1} OFFSET $${
        params.length + 2
      }`;
      params.push(options.limit, options.offset);

      const result = await this.db.query(query, params);

      const countQuery = `
        SELECT COUNT(*) as total FROM voice_call_logs 
        WHERE 1=1 ${options.status ? `AND status = '${options.status}'` : ''}
      `;
      const countResult = await this.db.query(countQuery);

      const sessions = result.rows.map((row) =>
        this.mapDatabaseRowToSession(row)
      );
      const total = parseInt(countResult.rows[0].total);

      return { sessions, total };
    } catch (error) {
      this.logger.error(`Failed to list sessions: ${error.message}`);
      return { sessions: [], total: 0 };
    }
  }

  async getAnalyticsSummary(period: string = 'day'): Promise<any> {
    try {
      const periodClause = this.getPeriodClause(period);

      const query = `
        SELECT 
          COUNT(*) as total_calls,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_calls,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_calls,
          COUNT(CASE WHEN status = 'no-answer' THEN 1 END) as no_answer_calls,
          AVG(duration) as avg_duration,
          AVG(total_interactions) as avg_interactions,
          AVG(satisfaction_score) as avg_satisfaction,
          COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_calls,
          COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_calls,
          COUNT(CASE WHEN transferred_to IS NOT NULL THEN 1 END) as transferred_calls
        FROM voice_call_logs 
        WHERE start_time >= ${periodClause}
      `;

      const result = await this.db.query(query);
      const stats = result.rows[0];

      // Get intent distribution
      const intentQuery = `
        SELECT 
          primary_intent,
          COUNT(*) as count,
          AVG(intent_confidence) as avg_confidence
        FROM voice_call_logs 
        WHERE start_time >= ${periodClause} 
          AND primary_intent IS NOT NULL
        GROUP BY primary_intent
        ORDER BY count DESC
      `;

      const intentResult = await this.db.query(intentQuery);

      // Get hourly distribution
      const hourlyQuery = `
        SELECT 
          EXTRACT(HOUR FROM start_time) as hour,
          COUNT(*) as calls
        FROM voice_call_logs 
        WHERE start_time >= ${periodClause}
        GROUP BY EXTRACT(HOUR FROM start_time)
        ORDER BY hour
      `;

      const hourlyResult = await this.db.query(hourlyQuery);

      return {
        period,
        generatedAt: new Date().toISOString(),
        overview: {
          totalCalls: parseInt(stats.total_calls),
          completedCalls: parseInt(stats.completed_calls),
          failedCalls: parseInt(stats.failed_calls),
          noAnswerCalls: parseInt(stats.no_answer_calls),
          successRate: parseFloat(
            ((stats.completed_calls / stats.total_calls) * 100).toFixed(2)
          ),
          avgDuration: parseFloat(stats.avg_duration || 0),
          avgInteractions: parseFloat(stats.avg_interactions || 0),
          avgSatisfaction: parseFloat(stats.avg_satisfaction || 0),
          inboundCalls: parseInt(stats.inbound_calls),
          outboundCalls: parseInt(stats.outbound_calls),
          transferredCalls: parseInt(stats.transferred_calls),
          transferRate: parseFloat(
            ((stats.transferred_calls / stats.total_calls) * 100).toFixed(2)
          ),
        },
        intentDistribution: intentResult.rows.map((row) => ({
          intent: row.primary_intent,
          count: parseInt(row.count),
          percentage: parseFloat(
            ((row.count / stats.total_calls) * 100).toFixed(2)
          ),
          avgConfidence: parseFloat(row.avg_confidence || 0),
        })),
        hourlyDistribution: hourlyResult.rows.map((row) => ({
          hour: parseInt(row.hour),
          calls: parseInt(row.calls),
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to get analytics summary: ${error.message}`);
      throw error;
    }
  }

  private async identifyGuest(session: VoiceSession): Promise<void> {
    try {
      // Look up guest by phone number
      const guestQuery = `
        SELECT 
          g.first_name, g.last_name, g.email,
          COUNT(r.id) as reservation_count,
          MAX(r.created_at) as last_reservation
        FROM guests g
        LEFT JOIN reservations r ON g.id = r.guest_id
        WHERE g.phone = $1
        GROUP BY g.id, g.first_name, g.last_name, g.email
      `;

      const result = await this.db.query(guestQuery, [session.phoneNumber]);

      if (result.rows.length > 0) {
        const guest = result.rows[0];
        session.guestInfo = {
          name: `${guest.first_name} ${guest.last_name}`,
          email: guest.email,
          isReturningGuest: guest.reservation_count > 0,
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to identify guest for ${session.callSid}: ${error.message}`
      );
    }
  }

  private async saveSessionToDatabase(session: VoiceSession): Promise<void> {
    try {
      const upsertQuery = `
        INSERT INTO voice_call_logs (
          call_sid, session_id, phone_number, status, direction,
          start_time, end_time, duration, guest_name, guest_email,
          is_returning_guest, conversation_history, total_interactions,
          avg_response_time, transferred_to, transfer_reason,
          recording_url, satisfaction_score, primary_intent,
          intent_confidence, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, NOW(), NOW()
        )
        ON CONFLICT (call_sid) DO UPDATE SET
          status = EXCLUDED.status,
          end_time = EXCLUDED.end_time,
          duration = EXCLUDED.duration,
          conversation_history = EXCLUDED.conversation_history,
          total_interactions = EXCLUDED.total_interactions,
          avg_response_time = EXCLUDED.avg_response_time,
          transferred_to = EXCLUDED.transferred_to,
          transfer_reason = EXCLUDED.transfer_reason,
          recording_url = EXCLUDED.recording_url,
          satisfaction_score = EXCLUDED.satisfaction_score,
          primary_intent = EXCLUDED.primary_intent,
          intent_confidence = EXCLUDED.intent_confidence,
          updated_at = NOW()
      `;

      // Extract primary intent and confidence from conversation history
      const intents = session.conversationHistory
        .filter((h) => h.intent && h.confidence)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

      const primaryIntent = intents[0]?.intent || null;
      const intentConfidence = intents[0]?.confidence || null;

      await this.db.query(upsertQuery, [
        session.callSid,
        session.sessionId,
        session.phoneNumber,
        session.status,
        session.direction,
        session.startTime,
        session.endTime,
        session.duration,
        session.guestInfo?.name,
        session.guestInfo?.email,
        session.guestInfo?.isReturningGuest || false,
        JSON.stringify(session.conversationHistory),
        session.metadata?.totalInteractions,
        session.metadata?.avgResponseTime,
        session.metadata?.transferredTo,
        session.metadata?.transferReason,
        session.metadata?.recordingUrl,
        session.metadata?.satisfactionScore,
        primaryIntent,
        intentConfidence,
      ]);
    } catch (error) {
      this.logger.error(`Failed to save session to database: ${error.message}`);
    }
  }

  private mapDatabaseRowToSession(row: any): VoiceSession {
    return {
      sessionId: row.session_id,
      callSid: row.call_sid,
      phoneNumber: row.phone_number,
      status: row.status,
      direction: row.direction,
      startTime: row.start_time.toISOString(),
      endTime: row.end_time?.toISOString(),
      duration: row.duration,
      guestInfo: {
        name: row.guest_name,
        email: row.guest_email,
        isReturningGuest: row.is_returning_guest,
      },
      conversationHistory: JSON.parse(row.conversation_history || '[]'),
      metadata: {
        totalInteractions: row.total_interactions,
        avgResponseTime: row.avg_response_time,
        transferredTo: row.transferred_to,
        transferReason: row.transfer_reason,
        recordingUrl: row.recording_url,
        satisfactionScore: row.satisfaction_score,
      },
    };
  }

  private getPeriodClause(period: string): string {
    switch (period) {
      case 'hour':
        return "NOW() - INTERVAL '1 hour'";
      case 'day':
        return "NOW() - INTERVAL '1 day'";
      case 'week':
        return "NOW() - INTERVAL '1 week'";
      case 'month':
        return "NOW() - INTERVAL '1 month'";
      default:
        return "NOW() - INTERVAL '1 day'";
    }
  }

  private generateSessionId(callSid: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `session-${callSid}-${timestamp}-${random}`;
  }
}
