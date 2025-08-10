# Phase 4: Voice & Analytics Integration

This document describes the implementation of Phase 4 Voice & Analytics Integration for the hotel management system, featuring Twilio Voice webhooks, Whisper STT, OpenAI Intent Router, async MCP pipeline with TTS + SMS/WhatsApp responses, n8n OTA flows for rate/availability, and BI service with daily digest emails, cohort/ADR/RevPAR dashboards in Metabase.

## 🏗️ Architecture Overview

Phase 4 introduces comprehensive voice AI and business intelligence capabilities:

### Core Components:

1. **Voice Service** - Twilio Voice webhooks → Whisper STT → Intent Router (OpenAI functions)
2. **Async MCP Pipeline** - Multi-channel response system with TTS + SMS/WhatsApp
3. **n8n OTA Integration** - Real-time rate/availability synchronization workflows
4. **BI Service** - Daily digest emails, analytics, and dashboard data preparation
5. **Metabase Dashboards** - Cohort analysis, ADR/RevPAR reporting, and KPI visualization

### Integration Flow:

```
Twilio Voice Call → Voice Service → Whisper STT → OpenAI Intent Router → MCP Pipeline → Multi-channel Response (Voice TTS + SMS/WhatsApp) → Analytics Collection → BI Dashboards
```

## 🎙️ Voice Service (Port 3006)

### Features:

- **Twilio Voice Integration**: Handle incoming/outgoing voice calls via webhooks
- **Whisper STT**: OpenAI Whisper for speech-to-text transcription with hotel industry prompts
- **Intent Router**: OpenAI function calling for intent detection and parameter extraction
- **TTS Generation**: OpenAI TTS for natural voice responses
- **Session Management**: Complete voice call session tracking with Redis and PostgreSQL
- **Real-time Analytics**: Call metrics, intent distribution, and performance tracking

### Key Endpoints:

```
POST /api/v1/twilio/voice - Handle incoming Twilio voice calls
POST /api/v1/twilio/status - Handle call status updates
POST /api/v1/twilio/recording - Process call recordings
POST /api/v1/twilio/gather - Handle voice/DTMF input
POST /api/v1/voice/transcribe - Transcribe audio using Whisper
POST /api/v1/voice/intent - Detect intent from transcript
POST /api/v1/voice/tts - Generate text-to-speech audio
POST /api/v1/voice/mcp-pipeline - Trigger MCP processing
GET /api/v1/voice/session/{callSid} - Get voice session details
GET /api/v1/voice/analytics/summary - Voice analytics summary
```

### Supported Intents:

- `make_reservation` - Create new bookings
- `check_availability` - Room availability inquiries
- `modify_reservation` - Change existing bookings
- `cancel_reservation` - Cancel bookings
- `room_service` - Food and beverage orders
- `housekeeping_request` - Room cleaning and maintenance
- `check_in_status` - Check-in information
- `inquire_amenities` - Hotel facilities and services
- `complaint` - Guest issues and complaints
- `general_inquiry` - General information requests
- `transfer_human` - Escalation to human agents

## 🤖 MCP Pipeline Integration

### Async Processing:

- **Queue-based Architecture**: Bull/Redis queues for reliable processing
- **Multi-channel Responses**: Automatic voice, SMS, WhatsApp, and email follow-ups
- **Service Integration**: Connects to reservation, payment, and notification services
- **Pipeline Status Tracking**: Real-time monitoring of processing stages

### Response Channels:

- **Voice**: TTS-generated responses via Twilio
- **SMS**: Text message confirmations and follow-ups
- **WhatsApp**: Rich media messages with booking details
- **Email**: Detailed confirmations and receipts

## 🔄 n8n OTA Integration Workflows

### Rate & Availability Sync:

- **Real-time Monitoring**: Every 5-minute sync of voice call data
- **Availability Checking**: Automatic room availability validation
- **Rate Integration**: Current pricing data from pricing agent
- **Follow-up Automation**: Smart notifications based on availability and confidence scores
- **Analytics Pipeline**: Data enrichment for BI dashboards

### Workflow Features:

```javascript
// Voice Call Analysis Flow:
Voice Calls → Extract Availability Requests → Check Current Availability & Rates →
Enrich Data → Store Analytics → Follow-up Notifications → BI Integration
```

## 📊 BI Service (Port 3007)

### Daily Digest Emails:

- **Automated Scheduling**: Daily reports at 8:00 AM
- **KPI Summaries**: Voice call metrics, conversion rates, revenue data
- **Trend Analysis**: Week-over-week and month-over-month comparisons
- **Alert Integration**: Anomaly detection and performance warnings

### Analytics Features:

- **Voice Call Analytics**: Success rates, intent distribution, response times
- **Conversion Tracking**: Voice-to-booking conversion analysis
- **Cohort Analysis**: Guest behavior segmentation and lifetime value
- **Revenue Metrics**: ADR (Average Daily Rate) and RevPAR (Revenue Per Available Room)
- **Operational KPIs**: Housekeeping efficiency, maintenance response times

### Key Endpoints:

```
GET /api/v1/analytics/voice-summary - Voice call analytics
GET /api/v1/analytics/cohort-analysis - Guest cohort data
GET /api/v1/analytics/revenue-metrics - ADR/RevPAR calculations
GET /api/v1/dashboards/daily-digest - Daily KPI summary
POST /api/v1/reports/generate - On-demand report generation
GET /api/v1/metabase/dashboards - Metabase dashboard integration
```

## 📈 Metabase Dashboard Integration

### Available Dashboards:

1. **Voice Analytics Dashboard**

   - Call volume trends
   - Intent success rates
   - Average handling time
   - Transfer rates and reasons

2. **Revenue Performance Dashboard**

   - ADR trends by room type
   - RevPAR analysis by date range
   - Booking source analysis
   - Rate optimization insights

3. **Guest Cohort Dashboard**

   - New vs returning guest ratios
   - Lifetime value analysis
   - Booking pattern insights
   - Satisfaction score trends

4. **Operational Efficiency Dashboard**
   - Housekeeping cycle times
   - Maintenance response metrics
   - Staff productivity KPIs
   - Service quality indicators

### Key Metrics:

- **ADR (Average Daily Rate)**: `Total Room Revenue ÷ Rooms Sold`
- **RevPAR (Revenue Per Available Room)**: `Total Room Revenue ÷ Available Room Nights`
- **Voice Conversion Rate**: `Bookings from Voice Calls ÷ Total Voice Calls`
- **Customer Acquisition Cost**: `Marketing Spend ÷ New Customers Acquired`
- **Guest Lifetime Value**: `Average Revenue per Guest × Average Guest Lifespan`

## 🚀 Deployment & Configuration

### Environment Variables (.env):

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VOICE_NUMBER=your_twilio_phone_number
TWILIO_SMS_NUMBER=your_twilio_sms_number
TWILIO_WHATSAPP_NUMBER=whatsapp:+your_whatsapp_number

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
WHISPER_MODEL=whisper-1
TTS_MODEL=tts-1
TTS_VOICE=nova

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Metabase Configuration
METABASE_USERNAME=admin
METABASE_PASSWORD=secure_password

# BI Configuration
DAILY_DIGEST_ENABLED=true
DAILY_DIGEST_TIME=08:00
DAILY_DIGEST_RECIPIENTS=manager@hotel.com,owner@hotel.com

# n8n Configuration
N8N_USERNAME=admin
N8N_PASSWORD=secure_password
N8N_HOST=your_domain.com

# Notification Configuration
SLACK_WEBHOOK_URL=your_slack_webhook_url
BOOKING_URL=https://your_domain.com/book

# Infrastructure
GRAFANA_PASSWORD=admin123
```

### Development Setup:

```bash
# Install dependencies (already done)
npm install

# Start Phase 4 development services
npm run phase4:dev

# Or start individual services
npm run voice:dev      # Voice Service (Port 3006)
npm run bi-service:dev # BI Service (Port 3007)

# Database migrations (if needed)
npm run db:migrate

# Start supporting services with Docker
docker-compose -f docker-compose.phase4.yml up -d postgres redis metabase n8n
```

### Production Deployment:

```bash
# Build all Phase 4 services
npm run phase4:build

# Deploy with Docker Compose
docker-compose -f docker-compose.phase4.yml up -d

# Check service health
docker-compose -f docker-compose.phase4.yml ps
docker-compose -f docker-compose.phase4.yml logs voice-service
```

## 🔧 Service Configuration

### Voice Service Configuration:

- **Audio Storage**: Temporary audio files stored in `/app/audio` with automatic cleanup
- **Session Timeout**: Voice sessions expire after 2 hours in Redis
- **Rate Limiting**: 50 voice calls per minute, 100 TTS generations per minute
- **Intent Confidence Threshold**: Minimum 0.7 confidence for automatic processing

### BI Service Configuration:

- **Daily Digest Schedule**: Configurable time (default 8:00 AM)
- **Report Retention**: Analytics data retained for 2 years
- **Dashboard Refresh**: Real-time dashboards update every 5 minutes
- **Email Templates**: Customizable HTML templates for digest emails

## 📋 Database Schema Updates

### New Tables for Phase 4:

```sql
-- Voice call logs and analytics
CREATE TABLE voice_call_logs (
  call_sid VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  status VARCHAR(50),
  direction VARCHAR(20),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration INTEGER,
  guest_name VARCHAR(255),
  guest_email VARCHAR(255),
  is_returning_guest BOOLEAN DEFAULT false,
  conversation_history JSONB,
  total_interactions INTEGER DEFAULT 0,
  avg_response_time FLOAT,
  transferred_to VARCHAR(100),
  transfer_reason VARCHAR(255),
  recording_url VARCHAR(500),
  satisfaction_score FLOAT,
  primary_intent VARCHAR(100),
  intent_confidence FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Voice call analytics with rate/availability data
CREATE TABLE voice_call_analytics (
  id SERIAL PRIMARY KEY,
  call_sid VARCHAR(255) UNIQUE,
  phone_number VARCHAR(50),
  requested_check_in DATE,
  requested_check_out DATE,
  guests INTEGER,
  room_type VARCHAR(100),
  original_intent VARCHAR(100),
  voice_confidence FLOAT,
  voice_timestamp TIMESTAMP,
  is_available BOOLEAN,
  available_rooms_count INTEGER,
  base_rate DECIMAL(10,2),
  total_rate DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  follow_up_needed BOOLEAN DEFAULT false,
  follow_up_reason VARCHAR(100),
  suggested_action VARCHAR(100),
  rate_data JSONB,
  availability_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Daily digest email logs
CREATE TABLE daily_digest_logs (
  id SERIAL PRIMARY KEY,
  digest_date DATE NOT NULL,
  recipient_email VARCHAR(255),
  status VARCHAR(50),
  sent_at TIMESTAMP,
  email_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- BI dashboard cache
CREATE TABLE dashboard_cache (
  id SERIAL PRIMARY KEY,
  dashboard_key VARCHAR(255) UNIQUE,
  data JSONB,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 🔍 Monitoring & Analytics

### Key Performance Indicators:

1. **Voice Service KPIs**:

   - Call success rate (target: >95%)
   - Average call duration (benchmark: 3-5 minutes)
   - Intent detection accuracy (target: >90%)
   - Voice-to-booking conversion rate (target: >15%)

2. **Revenue KPIs**:

   - ADR growth (target: 5% YoY)
   - RevPAR optimization (target: 8% YoY)
   - Direct booking ratio (target: >40%)
   - Revenue per voice call (benchmark tracking)

3. **Operational KPIs**:
   - Average response time (target: <2 seconds)
   - Human transfer rate (target: <10%)
   - Guest satisfaction score (target: >4.5/5)
   - System uptime (target: 99.9%)

### Health Checks:

- **Voice Service**: `/api/v1/health` - Twilio connectivity, OpenAI API, Redis, Database
- **BI Service**: `/api/v1/health` - Database connectivity, SMTP, Metabase integration
- **MCP Hub**: `/health` - Queue status, service connectivity, processing capacity

## 🧪 Testing & Quality Assurance

### Voice Service Testing:

```bash
# Unit tests
nx test voice-service

# Integration tests (requires API keys)
npm run test:voice:integration

# Load testing voice endpoints
npm run test:voice:load
```

### BI Service Testing:

```bash
# Unit tests
nx test bi-service

# Daily digest generation test
npm run test:bi:digest

# Dashboard data validation
npm run test:bi:dashboards
```

### End-to-end Testing:

```bash
# Complete voice call flow test
npm run test:e2e:voice-flow

# Analytics pipeline test
npm run test:e2e:analytics-pipeline
```

## 🔐 Security Considerations

### Voice Service Security:

- **Twilio Webhook Validation**: Request signature verification
- **Audio File Encryption**: Temporary files with automatic cleanup
- **PII Protection**: Guest data encryption and retention policies
- **Rate Limiting**: Prevent abuse with throttling and circuit breakers

### BI Service Security:

- **Dashboard Access Control**: Role-based access to sensitive metrics
- **Email Security**: Encrypted email delivery and secure templates
- **Data Anonymization**: Guest PII masking in analytics dashboards
- **Audit Logging**: Complete activity trail for compliance

## 🛠️ Troubleshooting

### Common Issues:

1. **Voice calls not connecting**: Check Twilio webhook URL configuration
2. **Poor speech recognition**: Verify audio quality and background noise
3. **Intent detection failures**: Review OpenAI API quotas and model settings
4. **Missing analytics data**: Confirm n8n workflow execution
5. **Dashboard loading issues**: Verify Metabase connectivity and cache status

### Debug Commands:

```bash
# Check voice service logs
docker-compose -f docker-compose.phase4.yml logs voice-service

# Monitor MCP pipeline processing
docker-compose -f docker-compose.phase4.yml logs mcp-hub

# Verify n8n workflow execution
docker-compose -f docker-compose.phase4.yml logs n8n

# Check BI service daily digest
docker-compose -f docker-compose.phase4.yml logs bi-service | grep "digest"
```

## 🚀 Future Enhancements

### Planned Features:

- **Multi-language Support**: Whisper STT for 50+ languages
- **Advanced AI Features**: Sentiment analysis and emotion detection
- **Predictive Analytics**: ML-powered booking and revenue forecasting
- **Voice Biometrics**: Guest identification via voice patterns
- **Integration Expansion**: PMS, CRS, and CRM system connections

---

Phase 4 represents a significant advancement in hotel guest experience through AI-powered voice interactions and comprehensive business intelligence, providing both operational efficiency and strategic insights for hotel management.

## 📞 Support & Documentation

- **Voice Service API**: http://localhost:3006/api/docs
- **BI Service API**: http://localhost:3007/api/docs
- **Metabase Dashboards**: http://localhost:3000
- **n8n Workflows**: http://localhost:5678
- **System Monitoring**: http://localhost:3001 (Grafana)

For technical support and feature requests, please refer to the development team or create an issue in the project repository.
