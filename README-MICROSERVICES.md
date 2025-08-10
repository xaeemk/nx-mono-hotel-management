# Phase 1 Backend Engine - Microservices Implementation

This document provides comprehensive information about the implemented Node.js/TypeScript microservices architecture for the booking platform.

## 🏗️ Architecture Overview

The system consists of four main microservices orchestrated by MCP (Model Context Protocol) agents:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Payment        │    │  Reservation    │    │  Ledger         │    │  Notification   │
│  Service        │    │  Service        │    │  Service        │    │  Service        │
│  (Port: 3001)   │    │  (Port: 3002)   │    │  (Port: 3003)   │    │  (Port: 3004)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │                        │
        └────────────────────────┼────────────────────────┼────────────────────────┘
                                 │                        │
                         ┌─────────────────┐    ┌─────────────────┐
                         │  BullMQ         │    │  PostgreSQL     │
                         │  (Redis)        │    │  Database       │
                         │  Event Queue    │    │  Storage        │
                         └─────────────────┘    └─────────────────┘
```

## 🚀 Services Implementation

### 1. Payment Service (Port: 3001)

**Features:**

- **Multi-provider support**: bKash, Nagad, SSLCommerz
- **Webhook handling** for real-time payment updates
- **Event-driven architecture** with BullMQ
- **Comprehensive error handling**
- **Retry mechanisms** with exponential backoff

**Key Components:**

```typescript
// Payment providers with SDK wrappers
- BkashProvider: Token-based authentication, payment lifecycle management
- NagadProvider: RSA encryption, signature verification
- SSLCommerzProvider: Gateway integration, validation APIs

// State management
- Payment initiation → Confirmation → Completion flow
- Automatic status synchronization
- Webhook signature verification
```

**Endpoints:**

- `POST /api/v1/payments/initiate` - Start payment process
- `POST /api/v1/payments/{id}/confirm` - Confirm payment
- `GET /api/v1/payments/{id}` - Get payment status
- `POST /api/v1/payments/webhook/{provider}` - Provider webhooks

### 2. Reservation Service (Port: 3002)

**Features:**

- **XState state machine** implementation
- **State transitions**: `REQUESTED → PAYMENT_PENDING → PAYMENT_CONFIRMED → BOOKING_CONFIRMED`
- **Timeout handling** (30-minute payment window)
- **Retry logic** with maximum attempt limits
- **Event publishing** for state changes

**State Machine Flow:**

```typescript
idle → requested → paymentPending → paymentConfirmed → bookingConfirmed
  ↓         ↓            ↓              ↓               ↓
cancelled   cancelled    cancelled      cancelled       cancelled
            ↓            ↓              ↓
         error       paymentFailed    error
            ↓            ↓
         retry        retry
```

**Key Features:**

- Automatic cancellation on payment timeout
- Comprehensive logging of state transitions
- Event-driven communication with other services
- Rollback mechanisms for failed transactions

### 3. Ledger Service (Conceptual - Port: 3003)

**Features:**

- **Immutable append-only** transaction ledger
- **Event sourcing** pattern implementation
- **Double-entry bookkeeping** principles
- **Account balance** real-time calculation
- **Transaction history** with pagination

**Core Concepts:**

```typescript
// Transaction types
CREDIT, DEBIT, HOLD, RELEASE, REFUND

// Immutable entries with sequence numbers
- Entry ID + Account ID + Amount + Type
- Reference linking to payments/reservations
- Metadata for additional context
```

### 4. Notification Service (Conceptual - Port: 3004)

**Features:**

- **Twilio integration** for SMS/WhatsApp
- **Template-based messaging**
- **Event subscription** via BullMQ
- **Delivery status tracking**
- **Multi-channel support** (SMS, WhatsApp, Email)

**Event Triggers:**

- Payment initiated → Send confirmation SMS
- Payment confirmed → Send success notification
- Reservation confirmed → Send booking details
- Payment failed → Send failure alert

## 🔧 MCP Orchestration

The **MCP Orchestrator** coordinates the entire payment → ledger → reservation flow:

```typescript
// Orchestrated Flow
1. Create Reservation (REQUESTED)
2. Create Ledger Hold Entry
3. Initiate Payment
4. Send Initial Notification
5. [Wait for Payment Event]
6. Release Ledger Hold → Credit
7. Update Reservation (PAYMENT_CONFIRMED)
8. Confirm Booking (BOOKING_CONFIRMED)
9. Send Final Confirmation
```

**Key Features:**

- **Step-by-step execution** with checkpoints
- **Event-driven progression** between services
- **Rollback capabilities** for failed flows
- **Comprehensive logging** and monitoring
- **Retry logic** for transient failures

## 📋 Protocols & Contracts

### Protocol Buffers (gRPC)

- **payment.proto**: Payment service definitions
- **reservation.proto**: Reservation state management
- **ledger.proto**: Ledger operations
- **notification.proto**: Messaging services

### OpenAPI Specification

- **Complete REST API documentation**
- **Request/response schemas**
- **Error handling specifications**
- **Authentication requirements**

### TypeScript Types

- **Shared type definitions** across all services
- **Enum definitions** for statuses and types
- **Interface contracts** for inter-service communication
- **Error type hierarchies**

## 🛠️ Technology Stack

**Core Technologies:**

- **Node.js 18+** with TypeScript
- **Express.js** for REST APIs
- **XState** for state machine management
- **BullMQ** for event queuing
- **Redis** for caching and queues
- **PostgreSQL** for data persistence

**Payment Providers:**

- **bKash**: Mobile financial services (Bangladesh)
- **Nagad**: Digital payment platform (Bangladesh)
- **SSLCommerz**: Payment gateway solution

**Infrastructure:**

- **Docker** containerization
- **Nx monorepo** management
- **Winston** for structured logging
- **Joi** for request validation
- **Axios** for HTTP client

## 🚦 Getting Started

### Prerequisites

```bash
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+
```

### Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Start infrastructure services
docker-compose -f docker-compose.services.yml up -d postgres redis

# Start individual services
npm run serve payment-service
npm run serve reservation-service
npm run serve ledger-service
npm run serve notification-service
```

### Environment Configuration

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=booking_platform

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Payment Providers
BKASH_APP_KEY=your-bkash-app-key
NAGAD_MERCHANT_ID=your-nagad-merchant-id
SSLCOMMERZ_STORE_ID=your-sslcommerz-store-id

# Twilio
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
```

## 📊 Monitoring & Observability

**Available Endpoints:**

- **Health Checks**: `GET /health` on each service
- **BullMQ Dashboard**: `http://localhost:3005`
- **API Documentation**: `GET /docs` on each service

**Logging:**

- **Structured JSON logging** with Winston
- **Correlation IDs** for request tracking
- **Service-specific log levels**
- **Error stack traces** in development

## 🔄 Event Flow Example

### Complete Booking Flow

```typescript
1. User initiates booking request
   └─ MCP Orchestrator receives request

2. Create Reservation (REQUESTED)
   └─ Reservation Service → State Machine → "requested"

3. Create Ledger Hold
   └─ Ledger Service → Hold amount in customer account

4. Initiate Payment
   └─ Payment Service → bKash/Nagad/SSLCommerz

5. Send Initial SMS
   └─ Notification Service → "Payment initiated"

6. [User completes payment on provider]

7. Webhook received
   └─ Payment Service → Confirms payment

8. Release Hold + Credit
   └─ Ledger Service → Complete transaction

9. Update Reservation
   └─ State Machine → "paymentConfirmed"

10. Confirm Booking
    └─ State Machine → "bookingConfirmed"

11. Send Success SMS
    └─ Notification Service → "Booking confirmed"
```

## 🔍 API Examples

### Initiate Payment

```bash
curl -X POST http://localhost:3001/api/v1/payments/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": "BOOK_123456",
    "amount": 1000,
    "currency": "BDT",
    "provider": "BKASH",
    "customerPhone": "+8801712345678",
    "customerEmail": "user@example.com"
  }'
```

### Create Reservation

```bash
curl -X POST http://localhost:3002/api/v1/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUST_123",
    "serviceId": "SERVICE_456",
    "startTime": "2024-01-15T10:00:00Z",
    "endTime": "2024-01-15T11:00:00Z",
    "amount": 1000,
    "currency": "BDT"
  }'
```

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run specific service tests
npm run test payment-service
npm run test reservation-service

# Run integration tests
npm run test:integration

# Run load tests
npm run test:load
```

## 🚀 Deployment

### Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.services.yml up -d

# View logs
docker-compose logs -f payment-service

# Scale services
docker-compose up --scale payment-service=3
```

### Production Considerations

- **Load balancing** with Nginx/HAProxy
- **Database clustering** for high availability
- **Redis clustering** for queue persistence
- **Security hardening** and secret management
- **Rate limiting** and DDoS protection
- **SSL/TLS termination**

## 📈 Performance & Scalability

**Optimizations Implemented:**

- **Connection pooling** for database access
- **Redis caching** for frequent queries
- **Asynchronous processing** with event queues
- **Horizontal scaling** capability
- **Circuit breaker** patterns for resilience

**Monitoring Metrics:**

- Request/response times
- Error rates and types
- Queue depth and processing times
- Database connection pool utilization
- Memory and CPU usage patterns

---

This implementation provides a solid foundation for a production-ready booking platform with comprehensive payment processing, state management, and event-driven architecture.
