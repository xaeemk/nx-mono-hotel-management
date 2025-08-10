# Phase 3 Policy Store & Anti-Abuse Implementation

This document describes the implementation of Step 9: Phase 3 Policy Store & Anti-Abuse features for the hotel management system.

## Overview

The implementation includes:

1. **Configuration & Policy Tables** - Database schema for storing Notion-synced policies
2. **N8N Notion Sync Workflow** - Scheduled job to sync Notion database to config tables
3. **Ghost Booking Detector** - Service to identify bookings held without payment beyond thresholds
4. **Auto-Cancel Workflow** - N8N workflow to automatically cancel ghost bookings

## Database Schema Changes

### New Tables Added

#### 1. ConfigurationParameter

Stores system configuration parameters synced from Notion:

```sql
CREATE TABLE configuration_parameters (
  id VARCHAR PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  data_type VARCHAR(20) DEFAULT 'string',
  category VARCHAR(100),
  description TEXT,
  source VARCHAR(50) DEFAULT 'manual',
  source_id VARCHAR(255),
  last_sync_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  validation_rule TEXT,
  metadata JSONB,
  tags VARCHAR(50)[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  version INTEGER DEFAULT 1
);
```

#### 2. PolicyRule

Stores anti-abuse and policy rules synced from Notion:

```sql
CREATE TABLE policy_rules (
  id VARCHAR PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL,
  rule_type VARCHAR(50),
  condition JSONB,
  action JSONB,
  priority INTEGER DEFAULT 100,
  thresholds JSONB,
  cooldown_minutes INTEGER,
  max_violations INTEGER,
  is_active BOOLEAN DEFAULT true,
  is_test_mode BOOLEAN DEFAULT false,
  source VARCHAR(50) DEFAULT 'notion',
  source_id VARCHAR(255),
  last_sync_at TIMESTAMPTZ,
  description TEXT,
  metadata JSONB,
  tags VARCHAR(50)[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  version INTEGER DEFAULT 1
);
```

#### 3. PolicyViolation

Tracks policy violations and actions taken:

```sql
CREATE TABLE policy_violations (
  id VARCHAR PRIMARY KEY,
  policy_rule_id VARCHAR REFERENCES policy_rules(id),
  entity_type VARCHAR(50),
  entity_id VARCHAR(50),
  violation_type VARCHAR(100),
  severity VARCHAR(20) DEFAULT 'medium',
  violation_data JSONB,
  context JSONB,
  action_taken VARCHAR(255),
  action_result JSONB,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  session_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## N8N Workflows

### 1. Notion to Config Sync Workflow

**File:** `workflows/n8n/notion-sync/notion-to-config-sync.json`

**Schedule:** Hourly
**Purpose:** Syncs configuration parameters and policy rules from Notion databases to PostgreSQL tables.

**Workflow Steps:**

1. **Schedule Trigger** - Runs every hour
2. **Get Notion Policy Database** - Fetches configuration parameters from Notion
3. **Transform Notion Data** - Converts Notion pages to database format
4. **Upsert to Database** - Updates/inserts configuration parameters
5. **Get Policy Rules** - Fetches policy rules from separate Notion database
6. **Transform Policy Rules** - Converts policy rules to database format
7. **Upsert Policy Rules** - Updates/inserts policy rules
8. **Error Handling** - Sends Slack alerts on success/failure

**Required Environment Variables:**

```env
NOTION_API_CREDENTIAL_ID=your-notion-credential-id
NOTION_POLICY_DATABASE_ID=your-config-database-id
NOTION_POLICY_RULES_DATABASE_ID=your-rules-database-id
POSTGRES_CREDENTIAL_ID=your-postgres-credential-id
SLACK_WEBHOOK_URL=your-slack-webhook-url
```

### 2. Ghost Booking Auto-Cancel Workflow

**File:** `workflows/n8n/ghost-booking-detector/auto-cancel-workflow.json`

**Schedule:** Every 15 minutes
**Purpose:** Automatically cancels ghost bookings based on policy violations.

**Workflow Steps:**

1. **Schedule Trigger** - Runs every 15 minutes
2. **Query Ghost Bookings** - Finds high/critical severity violations
3. **Check Violations** - Determines if violations exist
4. **Process Violations** - Evaluates violations for auto-cancellation
5. **Execute Auto Cancel** - Updates reservation and room status
6. **Send Notifications** - Notifies guest via email and team via Slack
7. **Aggregate Results** - Summarizes batch processing results
8. **Log Summary** - Records batch processing in audit log

## Ghost Booking Detector Service

**File:** `apps/anomaly-detector/src/services/ghost-booking-detector.service.ts`

### Core Features

#### 1. Configuration-Driven Thresholds

```typescript
interface GhostBookingThresholds {
  holdTimeMinutes: number; // Max hold time before violation
  maxUnpaidReservations: number; // Max unpaid reservations per guest
  suspiciousPatternWindow: number; // Time window for pattern analysis
  maxSameGuestHolds: number; // Max holds per guest in window
  maxSameIPHolds: number; // Max holds per IP in window
}
```

#### 2. Detection Types

- **Hold Timeout** - Bookings held beyond threshold without payment
- **Excessive Holds** - Guests with too many unpaid reservations
- **Suspicious Patterns** - Rapid booking sequences indicating abuse

#### 3. Automated Actions

- **auto_cancel** - Automatically cancel the reservation
- **flag_review** - Flag for manual review
- **block_guest** - Block guest from further bookings
- **escalate** - Escalate to management

### Detection Logic

#### Hold Timeout Detection

```typescript
const expiredHolds = await this.prisma.reservation.findMany({
  where: {
    status: 'PENDING',
    bookedAt: { lt: cutoffTime },
    payments: {
      none: {
        status: { in: ['COMPLETED', 'PROCESSING'] },
      },
    },
  },
});
```

#### Excessive Holds Detection

```typescript
const guestHoldCounts = await this.prisma.reservation.groupBy({
  by: ['guestId'],
  where: {
    status: 'PENDING',
    bookedAt: { gte: windowStart },
  },
  having: {
    id: { _count: { gt: thresholds.maxSameGuestHolds } },
  },
});
```

## Integration with Anomaly Detector

The ghost booking detector is integrated into the existing anomaly detector service with:

1. **Scheduled Detection** - Runs every 10 minutes via cron job
2. **Queue-Based Processing** - Uses BullMQ for reliable job processing
3. **Action Processing** - Handles auto-cancel actions via action queue
4. **Logging & Monitoring** - Comprehensive logging and alerting

## Configuration Examples

### Notion Database Structure

#### Configuration Parameters Database

Required properties in Notion:

- **Key** (Title) - Configuration parameter key
- **Value** (Rich Text) - Parameter value
- **Category** (Select) - Parameter category
- **DataType** (Select) - string, number, boolean, json
- **Description** (Rich Text) - Parameter description
- **Active** (Checkbox) - Whether parameter is active
- **Tags** (Multi-select) - Parameter tags

#### Policy Rules Database

Required properties in Notion:

- **Name** (Title) - Rule name
- **Code** (Rich Text) - Unique rule code
- **RuleType** (Select) - ghost_booking, rate_limit, etc.
- **Condition** (Rich Text) - JSON condition object
- **Action** (Rich Text) - JSON action object
- **Priority** (Number) - Rule priority (lower = higher priority)
- **Thresholds** (Rich Text) - JSON threshold configuration
- **Active** (Checkbox) - Whether rule is active
- **TestMode** (Checkbox) - Test mode flag

### Sample Configuration Values

#### Ghost Booking Configuration

```
Key: ghost_booking.hold_time_minutes
Value: 30
Category: ghost_booking
DataType: number
Description: Maximum time in minutes a booking can be held without payment
```

```
Key: ghost_booking.max_same_guest_holds
Value: 5
Category: ghost_booking
DataType: number
Description: Maximum number of unpaid reservations a guest can hold simultaneously
```

#### Policy Rule Example

```json
{
  "name": "Ghost Booking Hold Timeout",
  "code": "ghost_booking_timeout",
  "ruleType": "ghost_booking",
  "condition": {
    "type": "hold_timeout",
    "holdTimeMinutes": 30,
    "allowedStatuses": ["PENDING"]
  },
  "action": {
    "type": "auto_cancel",
    "notifyGuest": true,
    "releaseRoom": true,
    "logViolation": true
  },
  "thresholds": {
    "criticalThreshold": 120,
    "highThreshold": 60,
    "mediumThreshold": 45
  }
}
```

## Deployment Notes

1. **Database Migration** - Run Prisma migration to create new tables
2. **N8N Setup** - Import workflows into N8N instance
3. **Environment Variables** - Configure required environment variables
4. **Notion Setup** - Create Notion databases with required properties
5. **Service Deployment** - Deploy updated anomaly detector service

## Monitoring & Alerting

### Metrics to Monitor

- Policy sync success/failure rates
- Ghost booking detection counts by type
- Auto-cancellation success rates
- Policy violation trends

### Alerts Configured

- Notion sync failures
- High ghost booking violation rates
- Auto-cancellation failures
- Configuration parameter validation errors

## Security Considerations

1. **Rate Limiting** - Prevent abuse of auto-cancellation system
2. **Validation** - Validate all configuration parameters before application
3. **Audit Trail** - Complete audit trail of all actions taken
4. **Access Control** - Restrict access to policy configuration
5. **Test Mode** - Test mode for policy rules to prevent unintended actions

## Future Enhancements

1. **Machine Learning** - ML-based ghost booking prediction
2. **Dynamic Thresholds** - Self-adjusting thresholds based on patterns
3. **Advanced Patterns** - IP-based detection and geolocation analysis
4. **Integration** - Integration with payment processor webhooks
5. **Dashboard** - Real-time dashboard for policy violations and actions
