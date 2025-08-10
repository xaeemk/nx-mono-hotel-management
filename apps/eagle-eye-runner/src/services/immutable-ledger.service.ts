import { Logger } from 'winston';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import {
  ImmutableLedgerEntry,
  generateId,
} from '../../../../libs/shared/types';

export interface LedgerVerificationResult {
  isValid: boolean;
  entriesVerified: number;
  merkleRootValid: boolean;
  errors: string[];
}

export class ImmutableLedgerService {
  private readonly LEDGER_PREFIX = 'eagle:ledger:';
  private readonly SEQUENCE_KEY = 'eagle:sequence';
  private readonly MERKLE_ROOT_KEY = 'eagle:merkle:root';
  private readonly DAILY_HASH_KEY = 'eagle:daily:hash';

  constructor(private readonly redis: Redis, private readonly logger: Logger) {}

  async createLedgerEntry(
    slotId: string,
    taskType: string,
    inputData: any,
    outputData?: any
  ): Promise<ImmutableLedgerEntry> {
    try {
      const entryId = generateId();
      const sequenceNumber = await this.getNextSequenceNumber();
      const timestamp = new Date();

      // Create hashes
      const inputHash = this.createHash(JSON.stringify(inputData));
      const outputHash = outputData
        ? this.createHash(JSON.stringify(outputData))
        : undefined;

      // Get previous hash for chaining
      const previousHash = await this.getLastEntryHash();

      // Create entry data for hashing
      const entryData = {
        id: entryId,
        sequenceNumber,
        timestamp: timestamp.toISOString(),
        slotId,
        taskType,
        inputHash,
        outputHash,
        previousHash,
      };

      // Calculate merkle root (simplified for this implementation)
      const merkleRoot = this.calculateMerkleRoot(entryData);

      // Create digital signature
      const signature = this.signEntry(entryData, merkleRoot);

      const ledgerEntry: ImmutableLedgerEntry = {
        ...entryData,
        timestamp,
        merkleRoot,
        signature,
        isValid: true,
        metadata: {
          inputDataSize: JSON.stringify(inputData).length,
          outputDataSize: outputData ? JSON.stringify(outputData).length : 0,
          createdAt: timestamp.toISOString(),
        },
      };

      // Store in Redis with multiple indexes
      await this.storeLedgerEntry(ledgerEntry);

      // Update merkle root
      await this.updateMerkleRoot(merkleRoot);

      this.logger.info('Immutable ledger entry created', {
        entryId,
        sequenceNumber,
        slotId,
        taskType,
        merkleRoot,
      });

      return ledgerEntry;
    } catch (error) {
      this.logger.error('Failed to create ledger entry', {
        slotId,
        taskType,
        error: error.message,
      });
      throw error;
    }
  }

  async getLedgerEntry(entryId: string): Promise<ImmutableLedgerEntry | null> {
    try {
      const entryData = await this.redis.get(
        `${this.LEDGER_PREFIX}entry:${entryId}`
      );
      if (!entryData) return null;

      return JSON.parse(entryData);
    } catch (error) {
      this.logger.error('Failed to get ledger entry', {
        entryId,
        error: error.message,
      });
      return null;
    }
  }

  async getLedgerEntriesBySlot(
    slotId: string
  ): Promise<ImmutableLedgerEntry[]> {
    try {
      const entryIds = await this.redis.smembers(
        `${this.LEDGER_PREFIX}slot:${slotId}`
      );
      const entries: ImmutableLedgerEntry[] = [];

      for (const entryId of entryIds) {
        const entry = await this.getLedgerEntry(entryId);
        if (entry) entries.push(entry);
      }

      return entries.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    } catch (error) {
      this.logger.error('Failed to get ledger entries by slot', {
        slotId,
        error: error.message,
      });
      return [];
    }
  }

  async getLedgerEntriesByDate(date: Date): Promise<ImmutableLedgerEntry[]> {
    try {
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      const entryIds = await this.redis.smembers(
        `${this.LEDGER_PREFIX}date:${dateKey}`
      );
      const entries: ImmutableLedgerEntry[] = [];

      for (const entryId of entryIds) {
        const entry = await this.getLedgerEntry(entryId);
        if (entry) entries.push(entry);
      }

      return entries.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    } catch (error) {
      this.logger.error('Failed to get ledger entries by date', {
        date,
        error: error.message,
      });
      return [];
    }
  }

  async verifyLedgerIntegrity(): Promise<LedgerVerificationResult> {
    try {
      this.logger.info('Starting ledger integrity verification...');

      const result: LedgerVerificationResult = {
        isValid: true,
        entriesVerified: 0,
        merkleRootValid: true,
        errors: [],
      };

      // Get all ledger entries
      const entryIds = await this.redis.keys(`${this.LEDGER_PREFIX}entry:*`);
      const entries: ImmutableLedgerEntry[] = [];

      for (const key of entryIds) {
        const entryData = await this.redis.get(key);
        if (entryData) {
          entries.push(JSON.parse(entryData));
        }
      }

      // Sort by sequence number
      entries.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

      result.entriesVerified = entries.length;

      // Verify each entry's integrity
      let previousHash = '';
      for (const entry of entries) {
        const verificationErrors = await this.verifyEntryIntegrity(
          entry,
          previousHash
        );

        if (verificationErrors.length > 0) {
          result.isValid = false;
          result.errors.push(...verificationErrors);
        }

        previousHash = this.createEntryHash(entry);
      }

      // Verify merkle root
      if (entries.length > 0) {
        const currentMerkleRoot = await this.getCurrentMerkleRoot();
        const calculatedMerkleRoot =
          this.calculateMerkleRootFromEntries(entries);

        if (currentMerkleRoot !== calculatedMerkleRoot) {
          result.isValid = false;
          result.merkleRootValid = false;
          result.errors.push(
            `Merkle root mismatch: stored=${currentMerkleRoot}, calculated=${calculatedMerkleRoot}`
          );
        }
      }

      this.logger.info('Ledger integrity verification completed', {
        isValid: result.isValid,
        entriesVerified: result.entriesVerified,
        merkleRootValid: result.merkleRootValid,
        errorCount: result.errors.length,
      });

      return result;
    } catch (error) {
      this.logger.error('Ledger integrity verification failed', {
        error: error.message,
      });
      return {
        isValid: false,
        entriesVerified: 0,
        merkleRootValid: false,
        errors: [`Verification failed: ${error.message}`],
      };
    }
  }

  async getLedgerStatistics(): Promise<{
    totalEntries: number;
    entriesByTaskType: Record<string, number>;
    entriesByDate: Record<string, number>;
    latestEntry: ImmutableLedgerEntry | null;
    currentSequenceNumber: number;
  }> {
    try {
      const currentSequenceNumber = await this.getCurrentSequenceNumber();
      const entryIds = await this.redis.keys(`${this.LEDGER_PREFIX}entry:*`);

      const entriesByTaskType: Record<string, number> = {};
      const entriesByDate: Record<string, number> = {};
      let latestEntry: ImmutableLedgerEntry | null = null;
      let maxSequence = 0;

      for (const key of entryIds) {
        const entryData = await this.redis.get(key);
        if (entryData) {
          const entry: ImmutableLedgerEntry = JSON.parse(entryData);

          // Count by task type
          entriesByTaskType[entry.taskType] =
            (entriesByTaskType[entry.taskType] || 0) + 1;

          // Count by date
          const dateKey = entry.timestamp.toISOString().split('T')[0];
          entriesByDate[dateKey] = (entriesByDate[dateKey] || 0) + 1;

          // Find latest entry
          if (entry.sequenceNumber > maxSequence) {
            maxSequence = entry.sequenceNumber;
            latestEntry = entry;
          }
        }
      }

      return {
        totalEntries: entryIds.length,
        entriesByTaskType,
        entriesByDate,
        latestEntry,
        currentSequenceNumber,
      };
    } catch (error) {
      this.logger.error('Failed to get ledger statistics', {
        error: error.message,
      });
      throw error;
    }
  }

  private async storeLedgerEntry(entry: ImmutableLedgerEntry): Promise<void> {
    const entryKey = `${this.LEDGER_PREFIX}entry:${entry.id}`;
    const slotKey = `${this.LEDGER_PREFIX}slot:${entry.slotId}`;
    const dateKey = `${this.LEDGER_PREFIX}date:${
      entry.timestamp.toISOString().split('T')[0]
    }`;
    const sequenceKey = `${this.LEDGER_PREFIX}sequence:${entry.sequenceNumber}`;

    // Store the entry
    await this.redis.setex(entryKey, 86400 * 365, JSON.stringify(entry)); // Keep for 1 year

    // Add to slot index
    await this.redis.sadd(slotKey, entry.id);
    await this.redis.expire(slotKey, 86400 * 365);

    // Add to date index
    await this.redis.sadd(dateKey, entry.id);
    await this.redis.expire(dateKey, 86400 * 365);

    // Add to sequence index
    await this.redis.setex(sequenceKey, 86400 * 365, entry.id);
  }

  private async getNextSequenceNumber(): Promise<number> {
    return await this.redis.incr(this.SEQUENCE_KEY);
  }

  private async getCurrentSequenceNumber(): Promise<number> {
    const current = await this.redis.get(this.SEQUENCE_KEY);
    return current ? parseInt(current, 10) : 0;
  }

  private async getLastEntryHash(): Promise<string> {
    const currentSequence = await this.getCurrentSequenceNumber();
    if (currentSequence === 0) return '';

    const lastEntryId = await this.redis.get(
      `${this.LEDGER_PREFIX}sequence:${currentSequence}`
    );
    if (!lastEntryId) return '';

    const lastEntry = await this.getLedgerEntry(lastEntryId);
    if (!lastEntry) return '';

    return this.createEntryHash(lastEntry);
  }

  private createHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private createEntryHash(entry: ImmutableLedgerEntry): string {
    const hashData = `${entry.id}${
      entry.sequenceNumber
    }${entry.timestamp.toISOString()}${entry.slotId}${entry.taskType}${
      entry.inputHash
    }${entry.outputHash || ''}${entry.previousHash}`;
    return this.createHash(hashData);
  }

  private calculateMerkleRoot(entryData: any): string {
    // Simplified merkle root calculation
    // In production, this would use a proper Merkle tree implementation
    const dataString = JSON.stringify(entryData);
    return this.createHash(dataString);
  }

  private calculateMerkleRootFromEntries(
    entries: ImmutableLedgerEntry[]
  ): string {
    if (entries.length === 0) return '';

    const entryHashes = entries.map((entry) => this.createEntryHash(entry));
    const combinedHash = entryHashes.join('');
    return this.createHash(combinedHash);
  }

  private signEntry(entryData: any, merkleRoot: string): string {
    // Simplified digital signature using HMAC
    // In production, this would use proper digital signatures (RSA, ECDSA)
    const secretKey = process.env.LEDGER_SECRET_KEY || 'default-secret-key';
    const dataToSign = `${JSON.stringify(entryData)}${merkleRoot}`;
    return crypto
      .createHmac('sha256', secretKey)
      .update(dataToSign)
      .digest('hex');
  }

  private verifySignature(
    entryData: any,
    merkleRoot: string,
    signature: string
  ): boolean {
    const expectedSignature = this.signEntry(entryData, merkleRoot);
    return expectedSignature === signature;
  }

  private async updateMerkleRoot(merkleRoot: string): Promise<void> {
    await this.redis.set(this.MERKLE_ROOT_KEY, merkleRoot);
  }

  private async getCurrentMerkleRoot(): Promise<string> {
    return (await this.redis.get(this.MERKLE_ROOT_KEY)) || '';
  }

  private async verifyEntryIntegrity(
    entry: ImmutableLedgerEntry,
    expectedPreviousHash: string
  ): Promise<string[]> {
    const errors: string[] = [];

    // Verify previous hash chain
    if (
      entry.sequenceNumber > 1 &&
      entry.previousHash !== expectedPreviousHash
    ) {
      errors.push(
        `Entry ${entry.id}: Previous hash mismatch. Expected: ${expectedPreviousHash}, Actual: ${entry.previousHash}`
      );
    }

    // Verify digital signature
    const entryDataForSigning = {
      id: entry.id,
      sequenceNumber: entry.sequenceNumber,
      timestamp: entry.timestamp.toISOString(),
      slotId: entry.slotId,
      taskType: entry.taskType,
      inputHash: entry.inputHash,
      outputHash: entry.outputHash,
      previousHash: entry.previousHash,
    };

    if (
      !this.verifySignature(
        entryDataForSigning,
        entry.merkleRoot,
        entry.signature
      )
    ) {
      errors.push(`Entry ${entry.id}: Digital signature verification failed`);
    }

    // Verify merkle root
    const expectedMerkleRoot = this.calculateMerkleRoot(entryDataForSigning);
    if (entry.merkleRoot !== expectedMerkleRoot) {
      errors.push(
        `Entry ${entry.id}: Merkle root mismatch. Expected: ${expectedMerkleRoot}, Actual: ${entry.merkleRoot}`
      );
    }

    return errors;
  }
}
