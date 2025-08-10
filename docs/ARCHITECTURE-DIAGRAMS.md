# System Architecture & Sequence Diagrams

This document provides comprehensive visual documentation of the hotel management platform architecture, including system diagrams, sequence flows, and interaction patterns.

## 📊 Table of Contents

1. [High-Level System Architecture](#high-level-system-architecture)
2. [Microservices Architecture](#microservices-architecture)
3. [Voice AI Pipeline](#voice-ai-pipeline)
4. [Database Schema](#database-schema)
5. [Sequence Diagrams](#sequence-diagrams)
6. [Network Architecture](#network-architecture)
7. [Deployment Architecture](#deployment-architecture)

## 🏗️ High-Level System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Dashboards]
        MOBILE[Mobile Apps]
        VOICE[Voice Calls]
        API_CLIENTS[API Clients]
    end

    subgraph "Gateway Layer"
        LB[Load Balancer]
        AG[API Gateway]
        AUTH[Authentication]
        RATE[Rate Limiting]
    end

    subgraph "Application Layer"
        subgraph "Core Services"
            CHECKIN[Checkin Service]
            HOUSEKEEPING[Housekeeping Service]
            ALLOCATION[Allocation Service]
            PAYMENT[Payment Service]
            RESERVATION[Reservation Service]
            NOTIFICATION[Notification Service]
        end

        subgraph "AI Services"
            VOICE_SVC[Voice Service]
            WHISPER[Whisper STT]
            INTENT[Intent Router]
            TTS[Text-to-Speech]
        end

        subgraph "Analytics"
            BI[BI Service]
            ANALYTICS[Analytics Engine]
        end

        subgraph "Orchestration"
            MCP[MCP Hub]
            WORKFLOWS[n8n Workflows]
        end
    end

    subgraph "Data Layer"
        POSTGRES[(PostgreSQL)]
        REDIS[(Redis)]
        S3[(S3 Storage)]
        METABASE[(Metabase)]
    end

    subgraph "External Services"
        TWILIO[Twilio]
        OPENAI[OpenAI]
        PAYMENT_PROVIDERS[Payment Providers]
        SMTP[Email Service]
        WHATSAPP[WhatsApp API]
    end

    subgraph "Monitoring"
        PROMETHEUS[Prometheus]
        GRAFANA[Grafana]
        LOKI[Loki]
        JAEGER[Jaeger]
    end

    WEB --> LB
    MOBILE --> LB
    VOICE --> TWILIO
    API_CLIENTS --> LB

    LB --> AG
    AG --> AUTH
    AG --> RATE

    AG --> CHECKIN
    AG --> HOUSEKEEPING
    AG --> ALLOCATION
    AG --> PAYMENT
    AG --> RESERVATION
    AG --> NOTIFICATION
    AG --> VOICE_SVC
    AG --> BI

    VOICE_SVC --> WHISPER
    VOICE_SVC --> INTENT
    VOICE_SVC --> TTS
    WHISPER --> OPENAI
    INTENT --> OPENAI
    TTS --> OPENAI

    TWILIO --> VOICE_SVC

    MCP --> CHECKIN
    MCP --> HOUSEKEEPING
    MCP --> ALLOCATION
    MCP --> PAYMENT
    MCP --> RESERVATION
    MCP --> NOTIFICATION

    WORKFLOWS --> MCP

    CHECKIN --> POSTGRES
    HOUSEKEEPING --> POSTGRES
    ALLOCATION --> POSTGRES
    PAYMENT --> POSTGRES
    RESERVATION --> POSTGRES
    NOTIFICATION --> POSTGRES
    VOICE_SVC --> POSTGRES
    BI --> POSTGRES

    CHECKIN --> REDIS
    VOICE_SVC --> REDIS
    MCP --> REDIS

    BI --> METABASE
    VOICE_SVC --> S3

    PAYMENT --> PAYMENT_PROVIDERS
    NOTIFICATION --> SMTP
    NOTIFICATION --> WHATSAPP

    ALL_SERVICES -.-> PROMETHEUS
    PROMETHEUS --> GRAFANA
    ALL_SERVICES -.-> LOKI
    ALL_SERVICES -.-> JAEGER
```

## 🔧 Microservices Architecture

```mermaid
graph TB
    subgraph "API Gateway (Port 3000)"
        GW_REST[REST Endpoints]
        GW_GQL[GraphQL Endpoint]
        GW_AUTH[Authentication]
        GW_RATE[Rate Limiting]
        GW_VALIDATION[Request Validation]
    end

    subgraph "Voice Service (Port 3006)"
        V_WEBHOOK[Twilio Webhooks]
        V_STT[Speech-to-Text]
        V_INTENT[Intent Detection]
        V_TTS[Text-to-Speech]
        V_SESSION[Session Management]
    end

    subgraph "Checkin Service (Port 3001)"
        C_CHECKIN[Check-in/out Logic]
        C_QR[QR Code Generation]
        C_OTP[OTP Verification]
        C_IOT[IoT Integration]
    end

    subgraph "Housekeeping Service (Port 3002)"
        H_STATE[State Machine]
        H_TASKS[Task Management]
        H_WORKFLOW[Workflow Engine]
        H_MOBILE[Mobile API]
    end

    subgraph "Allocation Service (Port 3003)"
        A_ALGORITHM[Room Algorithm]
        A_AVAILABILITY[Availability Engine]
        A_PREFERENCES[Guest Preferences]
        A_OPTIMIZATION[Optimization]
    end

    subgraph "Payment Service (Port 3004)"
        P_BKASH[bKash Integration]
        P_NAGAD[Nagad Integration]
        P_SSL[SSLCommerz Integration]
        P_WEBHOOK[Webhook Handler]
        P_STATE[Payment States]
    end

    subgraph "Reservation Service (Port 3005)"
        R_STATE[Booking State Machine]
        R_LIFECYCLE[Booking Lifecycle]
        R_VALIDATION[Availability Validation]
        R_PRICING[Dynamic Pricing]
    end

    subgraph "BI Service (Port 3007)"
        B_ANALYTICS[Analytics Engine]
        B_REPORTS[Report Generation]
        B_KPI[KPI Calculation]
        B_DIGEST[Daily Digest]
        B_DASHBOARDS[Dashboard Data]
    end

    subgraph "Notification Service (Port 3008)"
        N_SMS[SMS Gateway]
        N_WHATSAPP[WhatsApp API]
        N_EMAIL[Email Service]
        N_TEMPLATES[Template Engine]
        N_QUEUE[Notification Queue]
    end

    GW_REST --> V_WEBHOOK
    GW_REST --> C_CHECKIN
    GW_REST --> H_STATE
    GW_REST --> A_ALGORITHM
    GW_REST --> P_BKASH
    GW_REST --> R_STATE
    GW_REST --> B_ANALYTICS
    GW_REST --> N_SMS

    V_INTENT --> R_STATE
    V_INTENT --> C_CHECKIN
    V_SESSION --> N_SMS

    C_CHECKIN --> A_ALGORITHM
    C_CHECKIN --> H_STATE
    C_CHECKIN --> N_SMS

    H_TASKS --> N_SMS

    R_LIFECYCLE --> P_BKASH
    R_LIFECYCLE --> N_SMS
    R_LIFECYCLE --> A_ALGORITHM

    P_STATE --> R_LIFECYCLE
    P_WEBHOOK --> R_STATE

    B_ANALYTICS --> N_EMAIL
```

## 🎙️ Voice AI Pipeline

```mermaid
graph LR
    subgraph "Voice Input Processing"
        CALL[Incoming Call] --> TWILIO_WEBHOOK[Twilio Webhook]
        TWILIO_WEBHOOK --> GATHER[Gather Speech]
        GATHER --> AUDIO_FILE[Audio Recording]
    end

    subgraph "Speech Processing"
        AUDIO_FILE --> WHISPER_API[OpenAI Whisper]
        WHISPER_API --> TRANSCRIPT[Text Transcript]
        TRANSCRIPT --> INTENT_ROUTER[Intent Router]
    end

    subgraph "Intent Processing"
        INTENT_ROUTER --> OPENAI_FUNCTIONS[OpenAI Functions]
        OPENAI_FUNCTIONS --> INTENT_RESULT[Intent + Parameters]
        INTENT_RESULT --> MCP_PIPELINE[MCP Pipeline]
    end

    subgraph "Business Logic"
        MCP_PIPELINE --> RESERVATION_SERVICE[Reservation Service]
        MCP_PIPELINE --> PAYMENT_SERVICE[Payment Service]
        MCP_PIPELINE --> ALLOCATION_SERVICE[Allocation Service]
        MCP_PIPELINE --> NOTIFICATION_SERVICE[Notification Service]
    end

    subgraph "Response Generation"
        RESERVATION_SERVICE --> RESPONSE_DATA[Service Response]
        PAYMENT_SERVICE --> RESPONSE_DATA
        ALLOCATION_SERVICE --> RESPONSE_DATA
        RESPONSE_DATA --> TTS_ENGINE[TTS Generation]
        TTS_ENGINE --> VOICE_RESPONSE[Voice Response]
        RESPONSE_DATA --> SMS_RESPONSE[SMS Response]
        RESPONSE_DATA --> WHATSAPP_RESPONSE[WhatsApp Response]
    end

    subgraph "Multi-channel Output"
        VOICE_RESPONSE --> TWILIO_CALL[Twilio Call Response]
        SMS_RESPONSE --> TWILIO_SMS[Twilio SMS]
        WHATSAPP_RESPONSE --> WHATSAPP_API[WhatsApp API]
    end

    TWILIO_CALL --> CALL_END[Call Completion]
    TWILIO_SMS --> NOTIFICATION_SENT[SMS Sent]
    WHATSAPP_API --> NOTIFICATION_SENT
```

## 💾 Database Schema

```mermaid
erDiagram
    USERS {
        uuid id PK
        string email
        string name
        string password_hash
        enum role
        timestamp created_at
        timestamp updated_at
    }

    GUESTS {
        uuid id PK
        string name
        string email
        string phone
        string identification
        json preferences
        boolean is_returning
        timestamp created_at
        timestamp updated_at
    }

    ROOMS {
        uuid id PK
        string room_number
        enum room_type
        enum status
        json amenities
        decimal base_rate
        integer floor
        timestamp created_at
        timestamp updated_at
    }

    RESERVATIONS {
        uuid id PK
        uuid guest_id FK
        uuid room_id FK
        enum status
        datetime check_in
        datetime check_out
        integer guests
        decimal amount
        string currency
        json metadata
        timestamp created_at
        timestamp updated_at
    }

    PAYMENTS {
        uuid id PK
        uuid reservation_id FK
        enum provider
        decimal amount
        string currency
        enum status
        string external_id
        json provider_response
        timestamp created_at
        timestamp updated_at
    }

    HOUSEKEEPING_TASKS {
        uuid id PK
        uuid room_id FK
        uuid assigned_to FK
        enum task_type
        enum status
        datetime scheduled_at
        datetime started_at
        datetime completed_at
        text notes
        json metadata
        timestamp created_at
        timestamp updated_at
    }

    VOICE_CALL_LOGS {
        string call_sid PK
        string session_id
        string phone_number
        enum status
        enum direction
        datetime start_time
        datetime end_time
        integer duration
        string guest_name
        string guest_email
        boolean is_returning_guest
        json conversation_history
        integer total_interactions
        float avg_response_time
        string transferred_to
        string transfer_reason
        string recording_url
        float satisfaction_score
        string primary_intent
        float intent_confidence
        timestamp created_at
        timestamp updated_at
    }

    VOICE_CALL_ANALYTICS {
        serial id PK
        string call_sid FK
        string phone_number
        date requested_check_in
        date requested_check_out
        integer guests
        string room_type
        string original_intent
        float voice_confidence
        timestamp voice_timestamp
        boolean is_available
        integer available_rooms_count
        decimal base_rate
        decimal total_rate
        string currency
        boolean follow_up_needed
        string follow_up_reason
        string suggested_action
        json rate_data
        json availability_data
        timestamp created_at
        timestamp updated_at
    }

    LEDGER_ENTRIES {
        uuid id PK
        uuid account_id
        enum transaction_type
        decimal amount
        string currency
        string reference_type
        string reference_id
        json metadata
        timestamp created_at
    }

    NOTIFICATIONS {
        uuid id PK
        string recipient
        enum channel
        string template_id
        json template_data
        enum status
        datetime sent_at
        string external_id
        text error_message
        timestamp created_at
        timestamp updated_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        string entity_type
        string entity_id
        json old_values
        json new_values
        string ip_address
        string user_agent
        timestamp created_at
    }

    USERS ||--o{ AUDIT_LOGS : "performs"
    GUESTS ||--o{ RESERVATIONS : "makes"
    ROOMS ||--o{ RESERVATIONS : "assigned_to"
    RESERVATIONS ||--o{ PAYMENTS : "has"
    ROOMS ||--o{ HOUSEKEEPING_TASKS : "requires"
    USERS ||--o{ HOUSEKEEPING_TASKS : "assigned_to"
    VOICE_CALL_LOGS ||--o{ VOICE_CALL_ANALYTICS : "analyzed"
    RESERVATIONS ||--o{ LEDGER_ENTRIES : "generates"
    PAYMENTS ||--o{ LEDGER_ENTRIES : "creates"
```

## 🔄 Sequence Diagrams

### Voice Call Processing Sequence

```mermaid
sequenceDiagram
    participant Caller
    participant Twilio
    participant VoiceService
    participant Whisper
    participant IntentRouter
    participant MCPPipeline
    participant ReservationService
    participant NotificationService
    participant TTS

    Caller->>+Twilio: Initiates voice call
    Twilio->>+VoiceService: POST /api/v1/twilio/voice
    VoiceService->>VoiceService: Create session
    VoiceService->>Twilio: TwiML response (gather speech)
    Twilio->>Caller: "Please tell me how I can help you"

    Caller->>Twilio: Speaks request
    Twilio->>+VoiceService: POST /api/v1/twilio/gather
    VoiceService->>+Whisper: Transcribe audio
    Whisper-->>-VoiceService: Text transcript

    VoiceService->>+IntentRouter: Detect intent
    IntentRouter->>OpenAI: Function calling
    OpenAI-->>IntentRouter: Intent + parameters
    IntentRouter-->>-VoiceService: Parsed intent

    VoiceService->>+MCPPipeline: Process intent
    MCPPipeline->>+ReservationService: Check availability
    ReservationService-->>-MCPPipeline: Availability data

    MCPPipeline->>+NotificationService: Queue SMS notification
    NotificationService-->>-MCPPipeline: SMS queued

    MCPPipeline-->>-VoiceService: Processing result

    VoiceService->>+TTS: Generate response
    TTS-->>-VoiceService: Audio response

    VoiceService->>Twilio: TwiML with audio URL
    Twilio->>Caller: Plays generated response

    VoiceService->>VoiceService: Update session & analytics

    Note over NotificationService: Async SMS delivery
    NotificationService->>Caller: SMS confirmation
```

### Reservation Creation Sequence

```mermaid
sequenceDiagram
    participant Client
    participant APIGateway
    participant ReservationService
    participant AllocationService
    participant PaymentService
    participant LedgerService
    participant NotificationService
    participant MCPHub

    Client->>+APIGateway: POST /api/v1/reservations
    APIGateway->>APIGateway: Validate JWT token
    APIGateway->>APIGateway: Rate limit check
    APIGateway->>+ReservationService: Create reservation

    ReservationService->>ReservationService: Initialize state machine
    ReservationService->>+AllocationService: Check room availability
    AllocationService-->>-ReservationService: Available rooms

    ReservationService->>ReservationService: Reserve room (REQUESTED state)
    ReservationService->>+MCPHub: Trigger orchestration flow

    MCPHub->>+LedgerService: Create hold entry
    LedgerService-->>-MCPHub: Hold created

    MCPHub->>+PaymentService: Initiate payment
    PaymentService->>PaymentProvider: Create payment
    PaymentProvider-->>PaymentService: Payment URL
    PaymentService-->>-MCPHub: Payment initiated

    MCPHub->>+NotificationService: Send initial notification
    NotificationService->>SMS: Send SMS to guest
    NotificationService-->>-MCPHub: Notification sent

    MCPHub-->>-ReservationService: Orchestration started
    ReservationService-->>-APIGateway: Reservation created
    APIGateway-->>-Client: 201 Created with payment URL

    Note over PaymentProvider: Guest completes payment
    PaymentProvider->>PaymentService: Webhook notification
    PaymentService->>MCPHub: Payment confirmed event

    MCPHub->>LedgerService: Release hold & credit
    MCPHub->>ReservationService: Update to CONFIRMED
    MCPHub->>NotificationService: Send confirmation

    NotificationService->>SMS: Booking confirmation SMS
    NotificationService->>Email: Booking details email
```

### Check-in Process Sequence

```mermaid
sequenceDiagram
    participant Guest
    participant Mobile
    participant CheckinService
    participant QRService
    participant OTPService
    participant HousekeepingService
    participant NotificationService
    participant IOTService

    Guest->>+Mobile: Scan QR code at reception
    Mobile->>+CheckinService: POST /api/v1/checkin/scan
    CheckinService->>+QRService: Validate QR code
    QRService-->>-CheckinService: QR code valid

    CheckinService->>CheckinService: Fetch reservation details
    CheckinService->>+OTPService: Generate OTP
    OTPService-->>-CheckinService: OTP generated

    CheckinService->>+NotificationService: Send OTP SMS
    NotificationService-->>-CheckinService: OTP sent
    CheckinService-->>-Mobile: OTP required

    Mobile-->>Guest: Display OTP input
    Guest->>+Mobile: Enter received OTP
    Mobile->>+CheckinService: POST /api/v1/checkin/verify-otp
    CheckinService->>OTPService: Verify OTP
    OTPService-->>CheckinService: OTP valid

    CheckinService->>CheckinService: Complete check-in
    CheckinService->>+HousekeepingService: Update room status
    HousekeepingService-->>-CheckinService: Room status updated

    CheckinService->>+IOTService: Unlock room door
    IOTService-->>-CheckinService: Door unlocked

    CheckinService->>+NotificationService: Send welcome message
    NotificationService->>WhatsApp: Welcome message with hotel info
    NotificationService-->>-CheckinService: Message sent

    CheckinService-->>-Mobile: Check-in completed
    Mobile-->>Guest: Welcome! Room ready
```

## 🌐 Network Architecture

```mermaid
graph TB
    subgraph "Internet"
        USERS[Users]
        MOBILE_USERS[Mobile Users]
        VOICE_CALLERS[Voice Callers]
    end

    subgraph "AWS Cloud - us-west-2"
        subgraph "Public Subnets"
            ALB[Application Load Balancer]
            NAT[NAT Gateway]
        end

        subgraph "Private Subnets - AZ-1"
            subgraph "EKS Worker Nodes - AZ-1"
                GATEWAY_1[API Gateway Pods]
                VOICE_1[Voice Service Pods]
                SERVICES_1[Other Service Pods]
            end
            RDS_1[(RDS Primary)]
        end

        subgraph "Private Subnets - AZ-2"
            subgraph "EKS Worker Nodes - AZ-2"
                GATEWAY_2[API Gateway Pods]
                VOICE_2[Voice Service Pods]
                SERVICES_2[Other Service Pods]
            end
            RDS_2[(RDS Standby)]
        end

        subgraph "Private Subnets - AZ-3"
            subgraph "EKS Worker Nodes - AZ-3"
                MONITORING[Monitoring Stack]
            end
            REDIS[(ElastiCache Redis)]
        end

        subgraph "Managed Services"
            S3[(S3 Bucket)]
            ECR[ECR Registry]
            SECRETS[Secrets Manager]
            CLOUDWATCH[CloudWatch]
        end
    end

    subgraph "External APIs"
        TWILIO_API[Twilio API]
        OPENAI_API[OpenAI API]
        PAYMENT_APIS[Payment APIs]
        SMTP_SERVICE[SMTP Service]
    end

    USERS --> ALB
    MOBILE_USERS --> ALB
    VOICE_CALLERS --> TWILIO_API

    ALB --> GATEWAY_1
    ALB --> GATEWAY_2

    GATEWAY_1 --> VOICE_1
    GATEWAY_1 --> SERVICES_1
    GATEWAY_2 --> VOICE_2
    GATEWAY_2 --> SERVICES_2

    SERVICES_1 --> RDS_1
    SERVICES_2 --> RDS_1
    RDS_1 -.-> RDS_2

    VOICE_1 --> REDIS
    VOICE_2 --> REDIS

    SERVICES_1 --> S3
    SERVICES_2 --> S3

    VOICE_1 --> TWILIO_API
    VOICE_2 --> TWILIO_API

    VOICE_1 --> OPENAI_API
    VOICE_2 --> OPENAI_API

    SERVICES_1 --> PAYMENT_APIS
    SERVICES_2 --> PAYMENT_APIS

    SERVICES_1 --> SMTP_SERVICE
    SERVICES_2 --> SMTP_SERVICE

    ALL_PODS -.-> CLOUDWATCH
    ALL_PODS -.-> MONITORING
```

## 🚀 Deployment Architecture

```mermaid
graph TB
    subgraph "Development Environment"
        DEV_DOCKER[Docker Compose]
        DEV_POSTGRES[(Local PostgreSQL)]
        DEV_REDIS[(Local Redis)]
        DEV_SERVICES[Development Services]
    end

    subgraph "CI/CD Pipeline"
        GITHUB[GitHub Repository]
        ACTIONS[GitHub Actions]
        ECR_STAGING[ECR - Staging]
        ECR_PROD[ECR - Production]
    end

    subgraph "Staging Environment - EKS"
        STAGING_ALB[Staging ALB]
        STAGING_PODS[Staging Pods]
        STAGING_RDS[(Staging RDS)]
        STAGING_REDIS[(Staging Redis)]
    end

    subgraph "Production Environment - EKS"
        PROD_ALB[Production ALB]

        subgraph "Blue-Green Deployment"
            BLUE_PODS[Blue Environment]
            GREEN_PODS[Green Environment]
        end

        PROD_RDS[(Production RDS - Multi-AZ)]
        PROD_REDIS[(Production Redis - Clustered)]
        PROD_S3[(Production S3)]

        subgraph "Monitoring - Production"
            PROD_PROMETHEUS[Prometheus Cluster]
            PROD_GRAFANA[Grafana HA]
            PROD_LOKI[Loki Cluster]
            PROD_JAEGER[Jaeger Cluster]
        end
    end

    subgraph "External Services"
        TWILIO[Twilio Production]
        OPENAI[OpenAI API]
        PAYMENT_PROD[Payment Providers]
    end

    DEV_DOCKER --> GITHUB
    GITHUB --> ACTIONS

    ACTIONS --> |Build & Test| ECR_STAGING
    ACTIONS --> |Deploy develop branch| STAGING_PODS

    ACTIONS --> |Build & Test| ECR_PROD
    ACTIONS --> |Deploy main branch| BLUE_PODS

    STAGING_ALB --> STAGING_PODS
    STAGING_PODS --> STAGING_RDS
    STAGING_PODS --> STAGING_REDIS

    PROD_ALB --> BLUE_PODS
    PROD_ALB --> GREEN_PODS

    BLUE_PODS --> PROD_RDS
    GREEN_PODS --> PROD_RDS

    BLUE_PODS --> PROD_REDIS
    GREEN_PODS --> PROD_REDIS

    BLUE_PODS --> PROD_S3
    GREEN_PODS --> PROD_S3

    BLUE_PODS --> TWILIO
    GREEN_PODS --> TWILIO

    BLUE_PODS --> OPENAI
    GREEN_PODS --> OPENAI

    BLUE_PODS --> PAYMENT_PROD
    GREEN_PODS --> PAYMENT_PROD

    BLUE_PODS -.-> PROD_PROMETHEUS
    GREEN_PODS -.-> PROD_PROMETHEUS

    PROD_PROMETHEUS --> PROD_GRAFANA
    PROD_PROMETHEUS -.-> PROD_LOKI
    PROD_PROMETHEUS -.-> PROD_JAEGER
```

## 📊 Data Flow Architecture

```mermaid
graph TB
    subgraph "Data Ingestion"
        VOICE_CALLS[Voice Calls]
        WEB_REQUESTS[Web Requests]
        MOBILE_REQUESTS[Mobile Requests]
        WEBHOOKS[External Webhooks]
        IOT_DATA[IoT Sensor Data]
    end

    subgraph "Real-time Processing"
        VOICE_PIPELINE[Voice AI Pipeline]
        REQUEST_HANDLER[Request Handler]
        WEBHOOK_PROCESSOR[Webhook Processor]
        IOT_PROCESSOR[IoT Processor]
    end

    subgraph "Event Stream"
        REDIS_QUEUE[Redis Queues]
        EVENT_BUS[Event Bus]
        MCP_ORCHESTRATOR[MCP Orchestrator]
    end

    subgraph "Data Storage"
        POSTGRES_OLTP[(PostgreSQL - OLTP)]
        REDIS_CACHE[(Redis - Cache)]
        S3_STORAGE[(S3 - Object Storage)]
        ANALYTICS_DB[(Analytics Database)]
    end

    subgraph "Analytics & BI"
        ANALYTICS_ENGINE[Analytics Engine]
        METABASE[Metabase]
        REPORTING[Report Generator]
        DASHBOARDS[Real-time Dashboards]
    end

    subgraph "External APIs"
        TWILIO_DATA[Twilio Data]
        PAYMENT_DATA[Payment Data]
        OPENAI_DATA[OpenAI Data]
        SMS_DATA[SMS/WhatsApp Data]
    end

    VOICE_CALLS --> VOICE_PIPELINE
    WEB_REQUESTS --> REQUEST_HANDLER
    MOBILE_REQUESTS --> REQUEST_HANDLER
    WEBHOOKS --> WEBHOOK_PROCESSOR
    IOT_DATA --> IOT_PROCESSOR

    VOICE_PIPELINE --> REDIS_QUEUE
    REQUEST_HANDLER --> REDIS_QUEUE
    WEBHOOK_PROCESSOR --> REDIS_QUEUE
    IOT_PROCESSOR --> REDIS_QUEUE

    REDIS_QUEUE --> EVENT_BUS
    EVENT_BUS --> MCP_ORCHESTRATOR

    MCP_ORCHESTRATOR --> POSTGRES_OLTP
    VOICE_PIPELINE --> POSTGRES_OLTP
    REQUEST_HANDLER --> POSTGRES_OLTP

    POSTGRES_OLTP --> REDIS_CACHE
    VOICE_PIPELINE --> S3_STORAGE

    POSTGRES_OLTP --> ANALYTICS_ENGINE
    ANALYTICS_ENGINE --> ANALYTICS_DB

    ANALYTICS_DB --> METABASE
    ANALYTICS_ENGINE --> REPORTING
    METABASE --> DASHBOARDS

    TWILIO_DATA --> VOICE_PIPELINE
    PAYMENT_DATA --> WEBHOOK_PROCESSOR
    OPENAI_DATA --> VOICE_PIPELINE
    SMS_DATA --> WEBHOOK_PROCESSOR
```

---

## 📝 Notes

### Architecture Principles

- **Microservices**: Loosely coupled, independently deployable services
- **Event-Driven**: Asynchronous communication via events and queues
- **Scalable**: Horizontal scaling with load balancing
- **Resilient**: Circuit breakers, retries, and graceful degradation
- **Observable**: Comprehensive monitoring and distributed tracing

### Design Patterns Used

- **API Gateway Pattern**: Centralized entry point
- **Saga Pattern**: Distributed transactions via MCP orchestration
- **CQRS**: Command Query Responsibility Segregation for analytics
- **Event Sourcing**: Audit logs and state reconstruction
- **Circuit Breaker**: Fault tolerance for external services

### Performance Considerations

- **Caching Strategy**: Redis for session data and frequently accessed data
- **Database Optimization**: Connection pooling, read replicas, query optimization
- **Async Processing**: Background jobs for heavy processing
- **CDN**: Static assets served via CloudFront
- **Load Balancing**: Application Load Balancer with health checks

These architectural diagrams provide a comprehensive view of the system design, data flow, and deployment strategy for the hotel management platform.
