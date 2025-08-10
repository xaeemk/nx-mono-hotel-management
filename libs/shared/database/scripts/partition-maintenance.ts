#!/usr/bin/env node

/**
 * Partition Maintenance Script
 *
 * This script manages ledger_entries partitions:
 * - Creates future partitions to ensure data can be inserted
 * - Drops old partitions based on retention policy
 * - Logs all operations for monitoring
 *
 * Usage:
 * node partition-maintenance.ts [options]
 *
 * Options:
 * --future-months N    Number of future months to create partitions for (default: 6)
 * --retention-months N Number of months to retain data (default: 24)
 * --dry-run           Show what would be done without executing
 * --verbose           Enable verbose logging
 */

import { partitionManager, db } from '../src';

interface MaintenanceOptions {
  futureMonths: number;
  retentionMonths: number;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(): MaintenanceOptions {
  const args = process.argv.slice(2);
  const options: MaintenanceOptions = {
    futureMonths: 6,
    retentionMonths: 24,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--future-months':
        options.futureMonths = parseInt(args[++i], 10) || 6;
        break;
      case '--retention-months':
        options.retentionMonths = parseInt(args[++i], 10) || 24;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
Partition Maintenance Script

Usage: node partition-maintenance.ts [options]

Options:
  --future-months N     Number of future months to create partitions for (default: 6)
  --retention-months N  Number of months to retain data (default: 24)
  --dry-run            Show what would be done without executing
  --verbose            Enable verbose logging
  --help               Show this help message
`);
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return options;
}

async function getExistingPartitions(): Promise<string[]> {
  const result = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = current_schema() 
      AND tablename LIKE 'ledger_entries_%'
      AND tablename ~ '^ledger_entries_\\d{4}_\\d{2}$'
    ORDER BY tablename
  `;

  return result.map((row) => row.tablename);
}

async function checkPartitionHealth(): Promise<void> {
  try {
    // Check if there are any records in the main ledger_entries table
    // (which would indicate partition routing issues)
    const orphanRecords = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*) as count 
      FROM ONLY ledger_entries
    `;

    if (orphanRecords[0].count > 0) {
      console.warn(
        `⚠️  Warning: Found ${orphanRecords[0].count} records in the main ledger_entries table.`
      );
      console.warn(
        '   These records may not be in partitions and could indicate a partitioning issue.'
      );
    }

    // Check if we have data in future dates that might need partitions
    const futureData = await db.$queryRaw<Array<{ max_date: Date | null }>>`
      SELECT MAX(transaction_date) as max_date 
      FROM ledger_entries
    `;

    if (futureData[0].max_date) {
      const maxDate = new Date(futureData[0].max_date);
      const today = new Date();
      const monthsDiff =
        (maxDate.getFullYear() - today.getFullYear()) * 12 +
        (maxDate.getMonth() - today.getMonth());

      if (monthsDiff > 6) {
        console.warn(
          `⚠️  Warning: Data exists for ${monthsDiff} months in the future.`
        );
        console.warn('   Consider creating more future partitions.');
      }
    }
  } catch (error) {
    console.error('❌ Error checking partition health:', error);
  }
}

async function performMaintenance(options: MaintenanceOptions): Promise<void> {
  const startTime = Date.now();

  console.log('🔧 Starting partition maintenance...');
  console.log(`📅 Configuration:`);
  console.log(`   - Future months: ${options.futureMonths}`);
  console.log(`   - Retention months: ${options.retentionMonths}`);
  console.log(`   - Dry run: ${options.dryRun}`);
  console.log(`   - Verbose: ${options.verbose}`);
  console.log('');

  try {
    // Get existing partitions
    const existingPartitions = await getExistingPartitions();

    if (options.verbose) {
      console.log(`📊 Existing partitions: ${existingPartitions.length}`);
      existingPartitions.forEach((partition) => {
        console.log(`   - ${partition}`);
      });
      console.log('');
    }

    // Check partition health
    await checkPartitionHealth();

    // Create future partitions
    console.log('📈 Creating future partitions...');
    if (!options.dryRun) {
      await partitionManager.createFuturePartitions(options.futureMonths);
      console.log(
        `✅ Created partitions for the next ${options.futureMonths} months`
      );
    } else {
      console.log(
        `🔍 [DRY RUN] Would create partitions for the next ${options.futureMonths} months`
      );
    }

    // Clean up old partitions
    console.log('🗑️  Cleaning up old partitions...');
    if (!options.dryRun) {
      await partitionManager.dropOldLedgerPartitions(options.retentionMonths);
      console.log(
        `✅ Cleaned up partitions older than ${options.retentionMonths} months`
      );
    } else {
      console.log(
        `🔍 [DRY RUN] Would drop partitions older than ${options.retentionMonths} months`
      );
    }

    // Get updated partition list
    const updatedPartitions = await getExistingPartitions();

    console.log('');
    console.log(`📊 Final partition count: ${updatedPartitions.length}`);

    if (options.verbose) {
      console.log('📋 Current partitions:');
      updatedPartitions.forEach((partition) => {
        const isNew = !existingPartitions.includes(partition);
        console.log(
          `   ${isNew ? '+ ' : '  '}${partition}${isNew ? ' (new)' : ''}`
        );
      });
    }

    const duration = Date.now() - startTime;
    console.log('');
    console.log(
      `✅ Partition maintenance completed successfully in ${duration}ms`
    );
  } catch (error) {
    console.error('❌ Partition maintenance failed:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    const options = parseArgs();

    // Validate options
    if (options.futureMonths < 1 || options.futureMonths > 24) {
      throw new Error('Future months must be between 1 and 24');
    }

    if (options.retentionMonths < 1) {
      throw new Error('Retention months must be at least 1');
    }

    await performMaintenance(options);
  } catch (error) {
    console.error('💥 Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await db.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await db.$disconnect();
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main();
}
