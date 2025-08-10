// Shared types for all microservices

export enum PaymentProvider {
  BKASH = 'BKASH',
  NAGAD = 'NAGAD',
  SSLCOMMERZ = 'SSLCOMMERZ',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum ReservationStatus {
  REQUESTED = 'REQUESTED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
}

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  HOLD = 'HOLD',
  RELEASE = 'RELEASE',
  REFUND = 'REFUND',
}

export enum DeliveryStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  UNDELIVERED = 'UNDELIVERED',
}

export enum EventType {
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  RESERVATION_CREATED = 'RESERVATION_CREATED',
  RESERVATION_CONFIRMED = 'RESERVATION_CONFIRMED',
  RESERVATION_CANCELLED = 'RESERVATION_CANCELLED',
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
}

// Payment Service Types
export interface InitiatePaymentRequest {
  bookingId: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  customerPhone: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface InitiatePaymentResponse {
  paymentId: string;
  transactionId: string;
  status: PaymentStatus;
  redirectUrl?: string;
  errorMessage?: string;
}

export interface ConfirmPaymentRequest {
  paymentId: string;
  transactionId: string;
  providerReference: string;
  providerData?: Record<string, string>;
}

export interface ConfirmPaymentResponse {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  errorMessage?: string;
}

export interface PaymentRecord {
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  transactionId: string;
  providerReference?: string;
  customerPhone: string;
  customerEmail?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, string>;
}

// Reservation Service Types
export interface CreateReservationRequest {
  customerId: string;
  serviceId: string;
  startTime: Date;
  endTime: Date;
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
}

export interface CreateReservationResponse {
  reservationId: string;
  status: ReservationStatus;
  errorMessage?: string;
}

export interface UpdateReservationStatusRequest {
  reservationId: string;
  status: ReservationStatus;
  paymentId?: string;
  metadata?: Record<string, string>;
}

export interface ReservationRecord {
  reservationId: string;
  customerId: string;
  serviceId: string;
  status: ReservationStatus;
  startTime: Date;
  endTime: Date;
  amount: number;
  currency: string;
  paymentId?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, string>;
}

// Ledger Service Types
export interface CreateLedgerEntryRequest {
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  referenceId: string;
  referenceType: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface CreateLedgerEntryResponse {
  entryId: string;
  sequenceNumber: number;
  errorMessage?: string;
}

export interface LedgerEntry {
  entryId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  referenceId: string;
  referenceType: string;
  description?: string;
  sequenceNumber: number;
  createdAt: Date;
  metadata?: Record<string, string>;
}

export interface AccountBalance {
  accountId: string;
  balance: number;
  currency: string;
  lastUpdated: Date;
}

// Notification Service Types
export interface SendSMSRequest {
  to: string;
  from?: string;
  body: string;
  templateId?: string;
  templateData?: Record<string, string>;
  metadata?: Record<string, string>;
}

export interface SendWhatsAppRequest {
  to: string;
  from?: string;
  body: string;
  templateId?: string;
  templateData?: Record<string, string>;
  media?: MediaAttachment[];
  metadata?: Record<string, string>;
}

export interface SendEmailRequest {
  to: string;
  from?: string;
  subject: string;
  body: string;
  templateId?: string;
  templateData?: Record<string, string>;
  attachments?: MediaAttachment[];
  metadata?: Record<string, string>;
}

export interface NotificationResponse {
  messageId: string;
  status: DeliveryStatus;
  errorMessage?: string;
}

export interface MediaAttachment {
  url: string;
  contentType: string;
  filename: string;
}

// Event Bus Types
export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  source: string;
  version: string;
}

export interface PaymentEvent extends BaseEvent {
  data: {
    paymentId: string;
    bookingId: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
    provider: PaymentProvider;
  };
}

export interface ReservationEvent extends BaseEvent {
  data: {
    reservationId: string;
    customerId: string;
    serviceId: string;
    status: ReservationStatus;
    paymentId?: string;
  };
}

export interface LedgerEvent extends BaseEvent {
  data: {
    entryId: string;
    accountId: string;
    type: TransactionType;
    amount: number;
    currency: string;
    referenceId: string;
  };
}

// MCP Integration Types
export interface MCPAgentConfig {
  name: string;
  endpoint: string;
  capabilities: string[];
}

export interface OrchestrationContext {
  correlationId: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface OrchestrationStep {
  id: string;
  service: string;
  action: string;
  input: any;
  output?: any;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

export interface OrchestrationFlow {
  id: string;
  context: OrchestrationContext;
  steps: OrchestrationStep[];
  currentStep: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startTime: Date;
  endTime?: Date;
}

// Database Types
export interface BaseModel {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Phase 3 Agent Types

// Pricing Agent Types
export interface PricingRule {
  id: string;
  name: string;
  type:
    | 'BASE_RATE'
    | 'TIME_MULTIPLIER'
    | 'DEMAND_MULTIPLIER'
    | 'SEASONAL_MULTIPLIER';
  conditions: Record<string, any>;
  multiplier: number;
  baseRate?: number;
  priority: number;
  isActive: boolean;
  validFrom: Date;
  validTo?: Date;
  metadata?: Record<string, any>;
}

export interface PricingRequest {
  serviceId: string;
  roomType: string;
  checkInDate: Date;
  checkOutDate: Date;
  guestCount: number;
  customerTier?: string;
  promoCode?: string;
  metadata?: Record<string, any>;
}

export interface PricingResponse {
  baseRate: number;
  appliedMultipliers: {
    ruleId: string;
    ruleName: string;
    multiplier: number;
    amount: number;
  }[];
  finalPrice: number;
  currency: string;
  breakdown: Record<string, number>;
  validUntil: Date;
  pricingId: string;
}

// Eagle-Eye Runner Types
export interface EagleEyeSlot {
  id: string;
  slotNumber: 1 | 2 | 3 | 4;
  scheduledTime: Date;
  status: 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  taskType: string;
  payload: Record<string, any>;
  results?: Record<string, any>;
  executionTime?: number;
  error?: string;
  ledgerEntryId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImmutableLedgerEntry {
  id: string;
  sequenceNumber: number;
  timestamp: Date;
  slotId: string;
  taskType: string;
  inputHash: string;
  outputHash?: string;
  merkleRoot: string;
  previousHash: string;
  signature: string;
  isValid: boolean;
  metadata?: Record<string, any>;
}

// Anomaly Detection Types
export interface BookingPattern {
  customerId: string;
  bookingTime: Date;
  amount: number;
  roomType: string;
  duration: number; // in hours
  paymentMethod: string;
  location?: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AnomalyResult {
  id: string;
  bookingId: string;
  customerId: string;
  anomalyType: 'Z_SCORE' | 'ISOLATION_FOREST' | 'PATTERN_BREAK' | 'VELOCITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number;
  threshold: number;
  features: Record<string, number>;
  description: string;
  recommendedAction: 'MONITOR' | 'FLAG' | 'BLOCK' | 'MANUAL_REVIEW';
  autoActionTaken?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface RoomLockCommand {
  roomId: string;
  lockType: 'TEMPORARY' | 'INVESTIGATION' | 'PERMANENT';
  reason: string;
  duration?: number; // in minutes for temporary locks
  authorizedBy: string;
  metadata?: Record<string, any>;
}

// MCP Command Types
export interface MCPCommand {
  id: string;
  type:
    | 'ROOM_LOCK'
    | 'ROOM_UNLOCK'
    | 'CANCEL_BOOKING'
    | 'FREEZE_ACCOUNT'
    | 'ALERT';
  target: string; // room ID, user ID, booking ID, etc.
  payload: Record<string, any>;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  executionTime?: Date; // for scheduled commands
  retryCount?: number;
  maxRetries?: number;
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  result?: Record<string, any>;
  error?: string;
  createdAt: Date;
  executedAt?: Date;
}

// Configuration Types
export interface ServiceConfig {
  port: number;
  name: string;
  version: string;
  environment: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  whatsappNumber?: string;
}

export interface PaymentProviderConfig {
  bkash?: {
    appKey: string;
    appSecret: string;
    username: string;
    password: string;
    baseUrl: string;
  };
  nagad?: {
    merchantId: string;
    merchantPrivateKey: string;
    pgPublicKey: string;
    baseUrl: string;
  };
  sslcommerz?: {
    storeId: string;
    storePassword: string;
    baseUrl: string;
  };
}

// Error Types
export interface ServiceError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

export class PaymentServiceError extends Error {
  constructor(public code: string, message: string, public details?: any) {
    super(message);
    this.name = 'PaymentServiceError';
  }
}

export class ReservationServiceError extends Error {
  constructor(public code: string, message: string, public details?: any) {
    super(message);
    this.name = 'ReservationServiceError';
  }
}

export class LedgerServiceError extends Error {
  constructor(public code: string, message: string, public details?: any) {
    super(message);
    this.name = 'LedgerServiceError';
  }
}

export class NotificationServiceError extends Error {
  constructor(public code: string, message: string, public details?: any) {
    super(message);
    this.name = 'NotificationServiceError';
  }
}
