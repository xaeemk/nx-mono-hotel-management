import { createMachine, assign, interpret } from 'xstate';
import {
  ReservationStatus,
  ReservationRecord,
  PaymentStatus,
  EventType,
  createLogger,
} from '../../../../libs/shared/utils';

const logger = createLogger('reservation-state-machine');

export interface ReservationContext {
  reservation: ReservationRecord | null;
  error: string | null;
  paymentId?: string;
  retryCount: number;
}

export type ReservationEvent =
  | {
      type: 'CREATE_RESERVATION';
      data: Omit<
        ReservationRecord,
        'reservationId' | 'status' | 'createdAt' | 'updatedAt'
      >;
    }
  | { type: 'PAYMENT_INITIATED'; paymentId: string }
  | { type: 'PAYMENT_CONFIRMED'; paymentId: string; amount: number }
  | { type: 'PAYMENT_FAILED'; paymentId: string; error: string }
  | { type: 'CONFIRM_BOOKING' }
  | { type: 'CANCEL_RESERVATION'; reason: string }
  | { type: 'RETRY' }
  | { type: 'ERROR'; error: string };

export const reservationMachine = createMachine<
  ReservationContext,
  ReservationEvent
>(
  {
    id: 'reservation',
    initial: 'idle',
    context: {
      reservation: null,
      error: null,
      retryCount: 0,
    },
    states: {
      idle: {
        on: {
          CREATE_RESERVATION: {
            target: 'requested',
            actions: assign({
              reservation: (context, event) =>
                ({
                  ...event.data,
                  reservationId: generateReservationId(),
                  status: ReservationStatus.REQUESTED,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                } as ReservationRecord),
              error: null,
              retryCount: 0,
            }),
          },
        },
      },

      requested: {
        entry: ['logStateEntry'],
        on: {
          PAYMENT_INITIATED: {
            target: 'paymentPending',
            actions: [
              assign({
                paymentId: (context, event) => event.paymentId,
                reservation: (context, event) => ({
                  ...context.reservation!,
                  status: ReservationStatus.PAYMENT_PENDING,
                  paymentId: event.paymentId,
                  updatedAt: new Date(),
                }),
              }),
              'publishReservationEvent',
            ],
          },
          CANCEL_RESERVATION: {
            target: 'cancelled',
            actions: [
              assign({
                reservation: (context, event) => ({
                  ...context.reservation!,
                  status: ReservationStatus.CANCELLED,
                  updatedAt: new Date(),
                  metadata: {
                    ...context.reservation!.metadata,
                    cancellationReason: event.reason,
                  },
                }),
              }),
              'publishReservationEvent',
            ],
          },
          ERROR: {
            target: 'error',
            actions: assign({ error: (context, event) => event.error }),
          },
        },
      },

      paymentPending: {
        entry: ['logStateEntry'],
        on: {
          PAYMENT_CONFIRMED: {
            target: 'paymentConfirmed',
            actions: [
              assign({
                reservation: (context, event) => ({
                  ...context.reservation!,
                  status: ReservationStatus.PAYMENT_CONFIRMED,
                  updatedAt: new Date(),
                  metadata: {
                    ...context.reservation!.metadata,
                    confirmedAmount: event.amount,
                  },
                }),
              }),
              'publishReservationEvent',
            ],
          },
          PAYMENT_FAILED: {
            target: 'paymentFailed',
            actions: [
              assign({
                error: (context, event) => event.error,
                reservation: (context, event) => ({
                  ...context.reservation!,
                  status: ReservationStatus.CANCELLED,
                  updatedAt: new Date(),
                  metadata: {
                    ...context.reservation!.metadata,
                    paymentError: event.error,
                  },
                }),
              }),
              'publishReservationEvent',
            ],
          },
          CANCEL_RESERVATION: {
            target: 'cancelled',
            actions: [
              assign({
                reservation: (context, event) => ({
                  ...context.reservation!,
                  status: ReservationStatus.CANCELLED,
                  updatedAt: new Date(),
                  metadata: {
                    ...context.reservation!.metadata,
                    cancellationReason: event.reason,
                  },
                }),
              }),
              'publishReservationEvent',
            ],
          },
        },
        after: {
          // Timeout after 30 minutes
          1800000: {
            target: 'expired',
            actions: [
              assign({
                reservation: (context) => ({
                  ...context.reservation!,
                  status: ReservationStatus.CANCELLED,
                  updatedAt: new Date(),
                  metadata: {
                    ...context.reservation!.metadata,
                    cancellationReason: 'Payment timeout',
                  },
                }),
              }),
              'publishReservationEvent',
            ],
          },
        },
      },

      paymentConfirmed: {
        entry: ['logStateEntry', 'scheduleBookingConfirmation'],
        on: {
          CONFIRM_BOOKING: {
            target: 'bookingConfirmed',
            actions: [
              assign({
                reservation: (context) => ({
                  ...context.reservation!,
                  status: ReservationStatus.BOOKING_CONFIRMED,
                  updatedAt: new Date(),
                }),
              }),
              'publishReservationEvent',
            ],
          },
          CANCEL_RESERVATION: {
            target: 'cancelled',
            actions: [
              assign({
                reservation: (context, event) => ({
                  ...context.reservation!,
                  status: ReservationStatus.CANCELLED,
                  updatedAt: new Date(),
                  metadata: {
                    ...context.reservation!.metadata,
                    cancellationReason: event.reason,
                  },
                }),
              }),
              'publishReservationEvent',
            ],
          },
          ERROR: {
            target: 'error',
            actions: assign({ error: (context, event) => event.error }),
          },
        },
      },

      bookingConfirmed: {
        entry: ['logStateEntry'],
        type: 'final',
        on: {
          CANCEL_RESERVATION: {
            target: 'cancelled',
            actions: [
              assign({
                reservation: (context, event) => ({
                  ...context.reservation!,
                  status: ReservationStatus.CANCELLED,
                  updatedAt: new Date(),
                  metadata: {
                    ...context.reservation!.metadata,
                    cancellationReason: event.reason,
                  },
                }),
              }),
              'publishReservationEvent',
            ],
          },
        },
      },

      cancelled: {
        entry: ['logStateEntry'],
        type: 'final',
      },

      expired: {
        entry: ['logStateEntry'],
        type: 'final',
      },

      paymentFailed: {
        entry: ['logStateEntry'],
        on: {
          RETRY: [
            {
              target: 'requested',
              cond: 'canRetry',
              actions: assign({
                retryCount: (context) => context.retryCount + 1,
                error: null,
              }),
            },
            {
              target: 'cancelled',
              actions: [
                assign({
                  reservation: (context) => ({
                    ...context.reservation!,
                    status: ReservationStatus.CANCELLED,
                    updatedAt: new Date(),
                    metadata: {
                      ...context.reservation!.metadata,
                      cancellationReason: 'Maximum retries exceeded',
                    },
                  }),
                }),
                'publishReservationEvent',
              ],
            },
          ],
          CANCEL_RESERVATION: {
            target: 'cancelled',
            actions: [
              assign({
                reservation: (context, event) => ({
                  ...context.reservation!,
                  status: ReservationStatus.CANCELLED,
                  updatedAt: new Date(),
                  metadata: {
                    ...context.reservation!.metadata,
                    cancellationReason: event.reason,
                  },
                }),
              }),
              'publishReservationEvent',
            ],
          },
        },
      },

      error: {
        entry: ['logStateEntry'],
        on: {
          RETRY: [
            {
              target: 'requested',
              cond: 'canRetry',
              actions: assign({
                retryCount: (context) => context.retryCount + 1,
                error: null,
              }),
            },
            {
              target: 'cancelled',
              actions: [
                assign({
                  reservation: (context) => ({
                    ...context.reservation!,
                    status: ReservationStatus.CANCELLED,
                    updatedAt: new Date(),
                    metadata: {
                      ...context.reservation!.metadata,
                      cancellationReason: 'Maximum retries exceeded',
                    },
                  }),
                }),
                'publishReservationEvent',
              ],
            },
          ],
          CANCEL_RESERVATION: {
            target: 'cancelled',
            actions: [
              assign({
                reservation: (context, event) => ({
                  ...context.reservation!,
                  status: ReservationStatus.CANCELLED,
                  updatedAt: new Date(),
                  metadata: {
                    ...context.reservation!.metadata,
                    cancellationReason: event.reason,
                  },
                }),
              }),
              'publishReservationEvent',
            ],
          },
        },
      },
    },
  },
  {
    guards: {
      canRetry: (context) => context.retryCount < 3,
    },
    actions: {
      logStateEntry: (context, event, { state }) => {
        logger.info('Reservation state transition', {
          reservationId: context.reservation?.reservationId,
          fromState: state.history?.value || 'initial',
          toState: state.value,
          event: event.type,
        });
      },
      publishReservationEvent: (context) => {
        // This will be implemented in the service layer
        logger.info('Publishing reservation event', {
          reservationId: context.reservation?.reservationId,
          status: context.reservation?.status,
        });
      },
      scheduleBookingConfirmation: (context) => {
        // This will trigger booking confirmation logic
        logger.info('Scheduling booking confirmation', {
          reservationId: context.reservation?.reservationId,
        });
      },
    },
  }
);

function generateReservationId(): string {
  return `RES_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export type ReservationService = ReturnType<
  typeof interpret<ReservationContext, any, ReservationEvent>
>;

export function createReservationService() {
  return interpret(reservationMachine);
}
