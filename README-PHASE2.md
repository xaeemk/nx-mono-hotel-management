# Phase 2: Front-of-House Automation Services

This document describes the implementation of Phase 2 services for the hotel management system, focusing on front-of-house automation including check-in, housekeeping, room allocation, and IoT device integration.

## 🏗️ Architecture Overview

Phase 2 introduces three new microservices:

1. **Check-in Service** - QR/OTP generation & validation for contactless check-in
2. **Housekeeping Service** - DIRTY → CLEANING → CLEAN state machine workflow
3. **Allocation Service** - First-clean-first-serve room allocation using Redis sorted sets
4. **IoT Integration** - MQTT/HTTP drivers for door-lock IoT devices

## 🔧 Services

### 1. Check-in Service (Port 3003)

**Features:**

- **QR Code Generation**: Generates secure QR codes for contactless check-in
- **OTP System**: 6-digit OTP generation and validation via email/SMS
- **Multi-factor Authentication**: Supports both QR and OTP verification methods
- **Session Management**: Redis-based session handling with expiration
- **Key Card Integration**: Generates digital key card data
- **Door Lock Integration**: Activates room door locks upon successful check-in

**Key Endpoints:**

```
POST /api/v1/checkin/initiate - Start check-in process
POST /api/v1/checkin/validate-otp - Validate OTP code
POST /api/v1/checkin/complete/{reservationId} - Complete check-in
GET /api/v1/qr/image/{qrToken} - Get QR code image
POST /api/v1/qr/validate - Validate QR code
```

**Technology Stack:**

- NestJS with TypeScript
- Redis for session/cache management
- QR code generation with `qrcode` library
- OTP generation with `speakeasy`
- Email integration with `nodemailer`
- Crypto-JS for token encryption

### 2. Housekeeping Service (Port 3004)

**Features:**

- **State Machine Workflow**: XState-powered DIRTY → CLEANING → CLEAN transitions
- **Real-time Status Tracking**: Live room status updates
- **Task Management**: Cleaning task assignment and completion tracking
- **Inspection Workflow**: Quality control with pass/fail inspection
- **Priority System**: Urgent, high, normal, low priority levels
- **MQTT Integration**: Real-time updates for housekeeping staff devices

**State Machine States:**

- `DIRTY` - Room needs cleaning after guest checkout
- `CLEANING` - Room is currently being cleaned
- `INSPECTING` - Room cleaning is complete, awaiting inspection
- `CLEAN` - Room is ready for next guest
- `OUT_OF_ORDER` - Room has maintenance issues
- `MAINTENANCE` - Room is undergoing maintenance

**Key Features:**

- Automatic state transitions based on events
- Housekeeper assignment and tracking
- Estimated completion times
- Issue reporting and tracking
- Integration with allocation service

### 3. Allocation Service (Port 3005)

**Features:**

- **First-Clean-First-Serve Algorithm**: Redis sorted sets prioritize earliest cleaned rooms
- **Smart Scoring System**: Multi-factor room scoring based on:
  - Time since cleaning (primary factor)
  - Guest priority level (VIP, loyalty, standard)
  - Room type preferences
  - Floor preferences
  - Accessibility requirements
- **Real-time Availability**: Live room availability tracking
- **Alternative Suggestions**: Provides backup room options
- **Queue Management**: Visual queue of available clean rooms

**Redis Data Structures:**

```
clean_rooms (sorted set) - Rooms sorted by cleaning timestamp
room_metadata (hash) - Room cleaning metadata
temp_reservation:{roomId} - Temporary 5-minute reservations
```

**Scoring Algorithm:**

```
Base Score = 100 - hours_since_cleaning
+ Priority Bonus (urgent: +200, vip: +150, loyalty: +100, standard: +50)
+ Room Type Match: +75
+ Preferred Floor: +25
- Special Requests Penalty: -10 per request
```

### 4. IoT Integration

**Features:**

- **Dual Protocol Support**: MQTT and HTTP drivers for different device types
- **Device Management**: Registration, status monitoring, health checks
- **Command Queue**: Reliable command delivery with timeout handling
- **Battery Monitoring**: Low battery alerts and tracking
- **Offline Detection**: Automatic device health monitoring
- **Error Handling**: Comprehensive error reporting and recovery

**MQTT Topics:**

```
hotel/rooms/{room}/lock/command - Send commands to door locks
hotel/rooms/{room}/lock/status - Device status updates
hotel/rooms/{room}/lock/response - Command responses
hotel/rooms/{room}/lock/heartbeat - Device heartbeat
hotel/rooms/{room}/lock/battery - Battery level updates
hotel/rooms/{room}/lock/error - Error notifications
```

**Supported Commands:**

- `unlock` - Unlock door (with auto-lock timer)
- `lock` - Lock door
- `status` - Get current lock status
- `activate_key` - Activate key card/code
- `deactivate_key` - Deactivate key card/code
- `emergency_unlock` - Emergency unlock

## 🔄 Service Integration

### Check-in Flow

1. Guest initiates check-in via mobile app/kiosk
2. Check-in service validates reservation
3. Generates QR code and/or sends OTP
4. Guest scans QR or enters OTP
5. System generates check-in token
6. Complete check-in activates door lock
7. Allocation service removes room from clean queue

### Housekeeping Flow

1. Guest checks out → Room status becomes DIRTY
2. Housekeeping service adds room to cleaning queue
3. Housekeeper assigned → Status becomes CLEANING
4. Cleaning completed → Status becomes INSPECTING
5. Inspector validates → Status becomes CLEAN
6. Allocation service adds room to available queue

### Room Allocation Flow

1. New reservation requires room assignment
2. Allocation service queries clean rooms queue (Redis sorted set)
3. Applies scoring algorithm considering guest preferences
4. Returns best available room with alternatives
5. Temporarily reserves room for 5 minutes
6. Removes room from clean queue when confirmed

## 📊 Redis Database Schema

```
DB 0: General cache
DB 1: Sessions
DB 2: Check-in sessions
DB 3: QR code data
DB 4: OTP data
DB 5: Housekeeping state machines
DB 6: IoT device registry
DB 7: Room allocation queue
```

## 🚀 Deployment

### Development

```bash
# Install dependencies
npm install

# Start individual services
nx serve checkin-service      # Port 3003
nx serve housekeeping-service # Port 3004
nx serve allocation-service   # Port 3005

# Start all Phase 2 services
docker-compose -f docker-compose.phase2.yml up
```

### Production

```bash
# Build all services
nx build checkin-service
nx build housekeeping-service
nx build allocation-service

# Deploy with Docker
docker-compose -f docker-compose.phase2.yml up -d
```

## 🔧 Configuration

### Environment Variables

```bash
# Check-in Service
CHECKIN_SERVICE_PORT=3003
REDIS_CHECKIN_DB=2
REDIS_QR_DB=3
REDIS_OTP_DB=4
CHECKIN_SECRET=your-secret-key
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Housekeeping Service
HOUSEKEEPING_SERVICE_PORT=3004
REDIS_HOUSEKEEPING_DB=5
MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME=hotel_service
MQTT_PASSWORD=mqtt_password

# Allocation Service
ALLOCATION_SERVICE_PORT=3005
REDIS_ALLOCATION_DB=7

# Common
DATABASE_URL=postgresql://user:pass@localhost:5432/hotel_db
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 📈 Monitoring

### Health Checks

All services include health check endpoints:

- `/api/v1/health` - Comprehensive health status
- `/api/v1/health/ready` - Service readiness
- `/api/v1/health/live` - Service liveness

### Metrics

- Check-in success rate
- Average check-in completion time
- Room cleaning cycle time
- Allocation efficiency
- IoT device uptime
- Queue lengths and wait times

### Logging

- Structured JSON logging
- Centralized log aggregation
- Error tracking and alerting
- Performance monitoring

## 🔐 Security

### Authentication

- JWT-based service authentication
- API key validation for external integrations
- Rate limiting with `@nestjs/throttler`

### Data Protection

- Encrypted sensitive data (OTP, tokens)
- Secure QR code generation
- Temporary session data with auto-expiration
- MQTT authentication and ACLs

### IoT Security

- Device registration and authentication
- Encrypted MQTT communications
- Command validation and authorization
- Audit logging for all device interactions

## 📚 API Documentation

Swagger documentation available at:

- Check-in Service: `http://localhost:3003/api/docs`
- Housekeeping Service: `http://localhost:3004/api/docs`
- Allocation Service: `http://localhost:3005/api/docs`

## 🧪 Testing

```bash
# Unit tests
nx test checkin-service
nx test housekeeping-service
nx test allocation-service

# Integration tests
nx e2e checkin-service
nx e2e housekeeping-service
nx e2e allocation-service

# Load testing
npm run test:load
```

## 🛠️ Development Tools

### Redis Management

- Redis Commander: `http://localhost:8081`
- Redis CLI: `redis-cli -h localhost -p 6379`

### MQTT Testing

- MQTT Explorer or similar MQTT client
- Command line: `mosquitto_pub` and `mosquitto_sub`

### Database Management

- pgAdmin or similar PostgreSQL client
- Prisma Studio: `npx prisma studio`

## 🔄 Future Enhancements

### Phase 3 Planned Features

- Mobile app integration
- Voice assistant support
- AI-powered predictive analytics
- Advanced IoT device support
- Integration with external systems (PMS, CRS)
- Real-time dashboard and analytics
- Automated maintenance scheduling

## 🐛 Troubleshooting

### Common Issues

1. **Redis Connection Failed**: Check Redis server status and connection parameters
2. **MQTT Broker Unavailable**: Verify Mosquitto broker is running and accessible
3. **Database Connection Issues**: Ensure PostgreSQL is running and DATABASE_URL is correct
4. **OTP Email Not Sending**: Verify SMTP configuration and credentials
5. **QR Code Not Generating**: Check file permissions and temporary directory access

### Debug Commands

```bash
# Check service status
docker-compose -f docker-compose.phase2.yml ps

# View service logs
docker-compose -f docker-compose.phase2.yml logs checkin-service

# Connect to Redis
docker exec -it hotel-redis redis-cli

# Check MQTT broker
docker exec -it hotel-mqtt mosquitto_sub -t "hotel/+/+/+"
```

---

For more detailed implementation information, refer to the individual service documentation and source code comments.
