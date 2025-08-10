export const environment = {
  production: true,
  port: process.env.VOICE_SERVICE_PORT || 3006,

  // Twilio Configuration
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    webhookUrl: process.env.TWILIO_WEBHOOK_URL || '',
    voiceNumber: process.env.TWILIO_VOICE_NUMBER || '',
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4',
    whisperModel: process.env.WHISPER_MODEL || 'whisper-1',
    ttsModel: process.env.TTS_MODEL || 'tts-1',
    ttsVoice: process.env.TTS_VOICE || 'nova',
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    voiceDb: parseInt(process.env.REDIS_VOICE_DB || '8'),
  },

  // Database
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // MCP Hub Configuration
  mcpHub: {
    url: process.env.MCP_HUB_URL || 'http://mcp-hub:8080',
  },

  // File Storage
  storage: {
    audioPath: process.env.AUDIO_STORAGE_PATH || '/app/audio',
    maxFileSize: parseInt(process.env.MAX_AUDIO_FILE_SIZE || '50000000'), // 50MB
  },

  // Service URLs
  services: {
    notificationService:
      process.env.NOTIFICATION_SERVICE_URL ||
      'http://notification-service:3007',
    reservationService:
      process.env.RESERVATION_SERVICE_URL || 'http://reservation-service:3001',
  },
};
