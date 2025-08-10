# Hotel Management System - Database Schema

This library contains the complete database schema and utilities for the hotel management system, implemented using Prisma ORM with PostgreSQL.

## Schema Overview

The database schema is designed for a comprehensive hotel management system with the following core entities:

### 📊 Core Tables

#### 👥 Guests

- Stores guest information (individual, corporate, VIP, groups)
- Supports loyalty programs and marketing preferences
- Includes address, contact, and business information
- Audit trails and versioning for optimistic locking

#### 🏨 Rooms

- Room inventory with types, amenities, and status tracking
- Support for different room configurations and accessibility features
- Maintenance and cleaning status tracking
- Base rate management and currency support

#### 💰 Rate Plans

- Flexible rate plan system with date-based validity
- Support for advance booking requirements and restrictions
- Weekend/weekday/holiday multipliers
- Cancellation policies and prepayment requirements
- Inclusions and restrictions (corporate rates, member rates)

#### 📅 Reservations

- Complete reservation lifecycle management
- Support for group bookings and master reservations
- Check-in/check-out tracking with early/late options
- Pricing breakdown with taxes, fees, and discounts
- Guest notes and special requests

#### 💳 Payments

- Multi-method payment processing (cards, transfers, cash, crypto)
- Integration with payment gateways
- Refund and chargeback handling
- PCI-compliant tokenized card storage
- Processing fee tracking

#### 📈 Ledger Entries (Partitioned)

- Double-entry bookkeeping system
- Monthly partitioned for high-volume transactions
- Support for reversals and reconciliation
- Tax tracking and reporting
- Business context (shifts, locations, departments)

### 🔐 Advanced Features

#### Auditing System

- Automatic change tracking for all main tables
- Captures old/new values and changed fields
- User context tracking (user ID, IP, session)
- Comprehensive audit trail for compliance

#### Optimistic Locking

- Version-based concurrency control
- Automatic version incrementing on updates
- Prevents lost updates in multi-user scenarios

#### Partitioning

- Monthly partitions for ledger_entries table
- Automatic partition management functions
- Configurable data retention policies
- Optimized for high-volume financial transactions

#### Performance Optimization

- Strategic indexing for common query patterns
- Full-text search capabilities for guests
- Partial indexes for active records
- Concurrent index creation

#### Utility Views

- `v_room_availability`: Real-time room status
- `v_financial_summary`: Daily financial reports
- `v_guest_history`: Guest stay statistics

## 🚀 Getting Started

### Prerequisites

- PostgreSQL 14 or higher
- Node.js 18 or higher
- npm or yarn package manager

### Installation

1. Install dependencies:

```bash
cd libs/shared/database
npm install
```

2. Set up your environment variables:

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your database connection details
DATABASE_URL="postgresql://username:password@localhost:5432/hotel_db"
```

3. Generate Prisma client:

```bash
npm run db:generate
```

4. Run database migrations:

```bash
npm run db:migrate
```

5. (Optional) Seed the database with sample data:

```bash
npm run db:seed
```

### Database Scripts

- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database (development)
- `npm run db:migrate` - Deploy migrations (production)
- `npm run db:migrate:dev` - Create and apply new migration (development)
- `npm run db:migrate:reset` - Reset database and apply all migrations
- `npm run db:studio` - Open Prisma Studio for database browsing
- `npm run db:seed` - Populate database with sample data

## 📊 Usage Examples

### Basic Operations

```typescript
import { db, withAuditContext } from '@nx-mono-repo/shared-database';

// Create a guest with audit context
const guest = await withAuditContext(
  {
    userId: 'user123',
    ipAddress: '192.168.1.100',
    sessionId: 'session456',
  },
  async () => {
    return db.guest.create({
      data: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        guestType: 'INDIVIDUAL',
        createdBy: 'user123',
      },
    });
  }
);

// Query available rooms
const availableRooms = await db.room.findMany({
  where: {
    status: 'AVAILABLE',
    maxOccupancy: { gte: 2 },
  },
  include: {
    ratePlans: {
      where: {
        ratePlan: {
          isActive: true,
          validFrom: { lte: new Date() },
          validTo: { gte: new Date() },
        },
      },
      include: {
        ratePlan: true,
      },
    },
  },
});

// Create a reservation
const reservation = await db.reservation.create({
  data: {
    reservationNumber: 'RES-001-2024',
    guestId: guest.id,
    roomId: availableRooms[0].id,
    ratePlanId: availableRooms[0].ratePlans[0].ratePlanId,
    checkInDate: new Date('2024-12-01'),
    checkOutDate: new Date('2024-12-03'),
    nights: 2,
    adults: 2,
    roomRate: 150.0,
    totalAmount: 318.0, // includes taxes
    taxAmount: 18.0,
    createdBy: 'user123',
  },
});
```

### Partition Management

```typescript
import { partitionManager } from '@nx-mono-repo/shared-database';

// Create partitions for the next 6 months
await partitionManager.createFuturePartitions(6);

// Clean up old partitions (keep 24 months)
await partitionManager.dropOldLedgerPartitions(24);

// Create a specific partition
await partitionManager.createMonthlyLedgerPartition(new Date('2025-01-01'));
```

### Financial Reporting

```typescript
// Get daily financial summary
const financialSummary = await db.$queryRaw`
  SELECT * FROM v_financial_summary 
  WHERE business_date >= CURRENT_DATE - INTERVAL '30 days'
  ORDER BY business_date DESC
`;

// Get room availability
const roomAvailability = await db.$queryRaw`
  SELECT * FROM v_room_availability
  WHERE current_status = 'AVAILABLE'
`;

// Get guest history
const guestStats = await db.$queryRaw`
  SELECT * FROM v_guest_history
  WHERE total_stays >= 5
  ORDER BY total_spent DESC
`;
```

## 🏗️ Schema Design Principles

### Data Integrity

- Foreign key constraints ensure referential integrity
- Check constraints for business rule validation
- Proper indexing for performance and uniqueness

### Scalability

- Partitioned tables for high-volume data
- Optimized queries with strategic indexes
- Connection pooling and query optimization

### Auditability

- Complete change tracking
- Immutable audit logs
- User context preservation

### Flexibility

- JSON fields for extensible data
- Enum types for controlled vocabularies
- Nullable relationships for optional data

### Security

- No sensitive data in plain text
- Tokenized payment information
- Audit trails for compliance

## 🔧 Maintenance

### Partition Management

Set up a cron job to automatically create future partitions and clean up old ones:

```bash
# Add to crontab (creates partitions monthly, cleans up quarterly)
0 1 1 * * /usr/bin/node -e "require('@nx-mono-repo/shared-database').partitionManager.createFuturePartitions(6)"
0 2 1 */3 * /usr/bin/node -e "require('@nx-mono-repo/shared-database').partitionManager.dropOldLedgerPartitions(24)"
```

### Index Maintenance

Monitor and maintain indexes for optimal performance:

```sql
-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY n_distinct DESC;

-- Reindex if needed
REINDEX DATABASE hotel_db;
```

### Backup Strategy

Implement regular backups with point-in-time recovery:

```bash
# Daily full backup
pg_dump -h localhost -U username hotel_db | gzip > backup_$(date +%Y%m%d).sql.gz

# WAL archiving for point-in-time recovery
archive_mode = on
archive_command = 'test ! -f /backup/wal/%f && cp %p /backup/wal/%f'
```

## 🤝 Contributing

1. Make schema changes in `schema.prisma`
2. Generate migration: `npm run db:migrate:dev`
3. Update seed data if needed
4. Test with sample data: `npm run db:seed`
5. Document changes in this README

## 📄 License

This database schema is part of the hotel management system and is proprietary to the organization.

## 🆘 Support

For database-related issues:

1. Check the logs: `docker logs postgres-container`
2. Verify connections: `npm run db:studio`
3. Review migrations: `npx prisma migrate status`
4. Contact the development team with specific error messages

---

**Note:** This schema supports a production-ready hotel management system with enterprise-grade features including auditing, partitioning, and comprehensive business logic support.
