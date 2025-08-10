import { PrismaClient } from './generated/client';

// Database connection singleton
let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

// Initialize Prisma client with proper configuration
export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'pretty',
  });
}

// Get or create Prisma client instance
export function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    prisma = createPrismaClient();
  } else {
    if (!global.__prisma) {
      global.__prisma = createPrismaClient();
    }
    prisma = global.__prisma;
  }
  return prisma;
}

// Export the default instance
export const db = getPrismaClient();

// Utility functions for setting audit context
export async function withAuditContext<T>(
  context: {
    userId?: string;
    userAgent?: string;
    ipAddress?: string;
    sessionId?: string;
  },
  operation: () => Promise<T>
): Promise<T> {
  const client = getPrismaClient();

  try {
    // Set context variables for audit triggers
    if (context.userId) {
      await client.$executeRaw`SELECT set_config('app.current_user_id', ${context.userId}, true)`;
    }
    if (context.userAgent) {
      await client.$executeRaw`SELECT set_config('app.user_agent', ${context.userAgent}, true)`;
    }
    if (context.ipAddress) {
      await client.$executeRaw`SELECT set_config('app.ip_address', ${context.ipAddress}, true)`;
    }
    if (context.sessionId) {
      await client.$executeRaw`SELECT set_config('app.session_id', ${context.sessionId}, true)`;
    }

    return await operation();
  } finally {
    // Reset context variables
    await client.$executeRaw`SELECT set_config('app.current_user_id', NULL, true)`;
    await client.$executeRaw`SELECT set_config('app.user_agent', NULL, true)`;
    await client.$executeRaw`SELECT set_config('app.ip_address', NULL, true)`;
    await client.$executeRaw`SELECT set_config('app.session_id', NULL, true)`;
  }
}

// Utility for partition management
export class PartitionManager {
  private client: PrismaClient;

  constructor(client: PrismaClient = getPrismaClient()) {
    this.client = client;
  }

  async createMonthlyLedgerPartition(date: Date): Promise<void> {
    await this.client
      .$executeRaw`SELECT create_monthly_ledger_partition(${date})`;
  }

  async dropOldLedgerPartitions(retentionMonths: number = 24): Promise<void> {
    await this.client
      .$executeRaw`SELECT drop_old_ledger_partitions(${retentionMonths})`;
  }

  async createFuturePartitions(monthsAhead: number = 6): Promise<void> {
    const today = new Date();
    for (let i = 0; i < monthsAhead; i++) {
      const futureDate = new Date(
        today.getFullYear(),
        today.getMonth() + i + 1,
        1
      );
      await this.createMonthlyLedgerPartition(futureDate);
    }
  }
}

// Export types and enums for use in applications
export * from './generated/client';
export type { Prisma } from './generated/client';

// Export the partition manager
export const partitionManager = new PartitionManager();

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
}

process.on('beforeExit', disconnectDatabase);
process.on('SIGINT', disconnectDatabase);
process.on('SIGTERM', disconnectDatabase);
