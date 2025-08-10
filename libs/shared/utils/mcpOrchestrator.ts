import { Logger } from 'winston';
import axios from 'axios';
import { Queue } from 'bullmq';
import {
  OrchestrationFlow,
  OrchestrationStep,
  OrchestrationContext,
  PaymentEvent,
  ReservationEvent,
  LedgerEvent,
  EventType,
  PaymentStatus,
  ReservationStatus,
  TransactionType,
  generateId,
  createLogger,
} from '../types';

export class MCPOrchestrator {
  private readonly logger: Logger;
  private flows: Map<string, OrchestrationFlow> = new Map();

  constructor(
    private readonly eventQueue: Queue,
    private readonly services: {
      paymentService: string;
      reservationService: string;
      ledgerService: string;
      notificationService: string;
    }
  ) {
    this.logger = createLogger('mcp-orchestrator');
  }

  async orchestratePaymentReservationFlow(
    context: OrchestrationContext,
    request: {
      customerId: string;
      serviceId: string;
      amount: number;
      currency: string;
      paymentProvider: string;
      customerPhone: string;
      customerEmail?: string;
      startTime: Date;
      endTime: Date;
    }
  ): Promise<OrchestrationFlow> {
    const flowId = generateId();

    const flow: OrchestrationFlow = {
      id: flowId,
      context,
      steps: [
        {
          id: generateId(),
          service: 'reservation-service',
          action: 'createReservation',
          input: {
            customerId: request.customerId,
            serviceId: request.serviceId,
            startTime: request.startTime,
            endTime: request.endTime,
            amount: request.amount,
            currency: request.currency,
          },
          status: 'PENDING',
        },
        {
          id: generateId(),
          service: 'payment-service',
          action: 'initiatePayment',
          input: {
            amount: request.amount,
            currency: request.currency,
            provider: request.paymentProvider,
            customerPhone: request.customerPhone,
            customerEmail: request.customerEmail,
          },
          status: 'PENDING',
        },
        {
          id: generateId(),
          service: 'ledger-service',
          action: 'createHoldEntry',
          input: {
            accountId: request.customerId,
            type: TransactionType.HOLD,
            amount: request.amount,
            currency: request.currency,
            referenceType: 'reservation',
          },
          status: 'PENDING',
        },
        {
          id: generateId(),
          service: 'notification-service',
          action: 'sendReservationConfirmation',
          input: {
            to: request.customerPhone,
            templateId: 'reservation_created',
            templateData: {
              amount: request.amount,
              serviceId: request.serviceId,
            },
          },
          status: 'PENDING',
        },
      ],
      currentStep: 0,
      status: 'RUNNING',
      startTime: new Date(),
    };

    this.flows.set(flowId, flow);

    // Start execution
    await this.executeNextStep(flow);

    return flow;
  }

  async handlePaymentEvent(event: PaymentEvent): Promise<void> {
    this.logger.info('Handling payment event', {
      eventType: event.type,
      paymentId: event.data.paymentId,
    });

    // Find flows that are waiting for this payment event
    for (const flow of this.flows.values()) {
      const paymentStep = flow.steps.find(
        (step) =>
          step.service === 'payment-service' &&
          step.output?.paymentId === event.data.paymentId
      );

      if (!paymentStep) continue;

      switch (event.type) {
        case EventType.PAYMENT_CONFIRMED:
          await this.handlePaymentConfirmed(flow, event);
          break;
        case EventType.PAYMENT_FAILED:
          await this.handlePaymentFailed(flow, event);
          break;
      }
    }
  }

  async handleReservationEvent(event: ReservationEvent): Promise<void> {
    this.logger.info('Handling reservation event', {
      eventType: event.type,
      reservationId: event.data.reservationId,
    });

    // Process reservation state changes and trigger next steps
    for (const flow of this.flows.values()) {
      const reservationStep = flow.steps.find(
        (step) =>
          step.service === 'reservation-service' &&
          step.output?.reservationId === event.data.reservationId
      );

      if (!reservationStep) continue;

      switch (event.type) {
        case EventType.RESERVATION_CREATED:
          await this.initiatePaymentForReservation(flow, event);
          break;
        case EventType.RESERVATION_CONFIRMED:
          await this.finalizeReservation(flow, event);
          break;
        case EventType.RESERVATION_CANCELLED:
          await this.handleReservationCancellation(flow, event);
          break;
      }
    }
  }

  private async executeNextStep(flow: OrchestrationFlow): Promise<void> {
    if (flow.currentStep >= flow.steps.length) {
      flow.status = 'COMPLETED';
      flow.endTime = new Date();
      this.logger.info('Orchestration flow completed', { flowId: flow.id });
      return;
    }

    const step = flow.steps[flow.currentStep];

    try {
      this.logger.info('Executing orchestration step', {
        flowId: flow.id,
        stepId: step.id,
        service: step.service,
        action: step.action,
      });

      const result = await this.callService(
        step.service,
        step.action,
        step.input
      );

      step.output = result;
      step.status = 'COMPLETED';

      // Move to next step
      flow.currentStep++;

      // Execute next step if it doesn't depend on events
      if (this.canExecuteImmediately(flow.steps[flow.currentStep])) {
        await this.executeNextStep(flow);
      }
    } catch (error) {
      this.logger.error('Orchestration step failed', {
        flowId: flow.id,
        stepId: step.id,
        error: error.message,
      });

      step.status = 'FAILED';
      step.error = error.message;
      flow.status = 'FAILED';
      flow.endTime = new Date();
    }
  }

  private async callService(
    service: string,
    action: string,
    input: any
  ): Promise<any> {
    const serviceUrl = this.services[service as keyof typeof this.services];

    if (!serviceUrl) {
      throw new Error(`Unknown service: ${service}`);
    }

    const endpoint = this.getServiceEndpoint(service, action);
    const response = await axios.post(`${serviceUrl}${endpoint}`, input);

    return response.data;
  }

  private getServiceEndpoint(service: string, action: string): string {
    const endpointMap: Record<string, Record<string, string>> = {
      'payment-service': {
        initiatePayment: '/api/v1/payments/initiate',
        confirmPayment: '/api/v1/payments/confirm',
      },
      'reservation-service': {
        createReservation: '/api/v1/reservations',
        updateStatus: '/api/v1/reservations',
      },
      'ledger-service': {
        createHoldEntry: '/api/v1/ledger/entries',
        releaseHold: '/api/v1/ledger/entries',
      },
      'notification-service': {
        sendSMS: '/api/v1/notifications/sms',
        sendReservationConfirmation: '/api/v1/notifications/sms',
      },
    };

    return endpointMap[service]?.[action] || '/';
  }

  private canExecuteImmediately(step?: OrchestrationStep): boolean {
    if (!step) return false;

    // Steps that need to wait for events
    const eventDependentActions = [
      'confirmPayment',
      'releaseHold',
      'confirmReservation',
    ];

    return !eventDependentActions.includes(step.action);
  }

  private async handlePaymentConfirmed(
    flow: OrchestrationFlow,
    event: PaymentEvent
  ): Promise<void> {
    // Release ledger hold and confirm reservation
    const ledgerStep = flow.steps.find(
      (step) =>
        step.service === 'ledger-service' && step.action === 'createHoldEntry'
    );

    if (ledgerStep) {
      await this.callService('ledger-service', 'releaseHold', {
        entryId: ledgerStep.output.entryId,
        type: TransactionType.CREDIT,
        referenceId: event.data.paymentId,
        referenceType: 'payment_confirmation',
      });
    }

    // Confirm reservation
    await this.callService('reservation-service', 'updateStatus', {
      status: ReservationStatus.PAYMENT_CONFIRMED,
      paymentId: event.data.paymentId,
    });

    // Send confirmation notification
    await this.callService('notification-service', 'sendSMS', {
      templateId: 'payment_confirmed',
      templateData: {
        amount: event.data.amount,
        paymentId: event.data.paymentId,
      },
    });
  }

  private async handlePaymentFailed(
    flow: OrchestrationFlow,
    event: PaymentEvent
  ): Promise<void> {
    // Cancel reservation and release hold
    await this.callService('reservation-service', 'updateStatus', {
      status: ReservationStatus.CANCELLED,
      paymentId: event.data.paymentId,
    });

    // Send failure notification
    await this.callService('notification-service', 'sendSMS', {
      templateId: 'payment_failed',
      templateData: {
        paymentId: event.data.paymentId,
      },
    });

    flow.status = 'FAILED';
    flow.endTime = new Date();
  }

  private async initiatePaymentForReservation(
    flow: OrchestrationFlow,
    event: ReservationEvent
  ): Promise<void> {
    const paymentStep = flow.steps.find(
      (step) => step.service === 'payment-service'
    );

    if (paymentStep && paymentStep.status === 'PENDING') {
      paymentStep.input.bookingId = event.data.reservationId;
      await this.executeStep(flow, paymentStep);
    }
  }

  private async finalizeReservation(
    flow: OrchestrationFlow,
    event: ReservationEvent
  ): Promise<void> {
    // Send final confirmation
    await this.callService('notification-service', 'sendSMS', {
      templateId: 'booking_confirmed',
      templateData: {
        reservationId: event.data.reservationId,
      },
    });

    flow.status = 'COMPLETED';
    flow.endTime = new Date();
  }

  private async handleReservationCancellation(
    flow: OrchestrationFlow,
    event: ReservationEvent
  ): Promise<void> {
    // Handle cancellation cleanup
    flow.status = 'FAILED';
    flow.endTime = new Date();
  }

  private async executeStep(
    flow: OrchestrationFlow,
    step: OrchestrationStep
  ): Promise<void> {
    try {
      const result = await this.callService(
        step.service,
        step.action,
        step.input
      );
      step.output = result;
      step.status = 'COMPLETED';
    } catch (error) {
      step.status = 'FAILED';
      step.error = error.message;
      throw error;
    }
  }

  getFlow(flowId: string): OrchestrationFlow | undefined {
    return this.flows.get(flowId);
  }

  getAllFlows(): OrchestrationFlow[] {
    return Array.from(this.flows.values());
  }

  getActiveFlows(): OrchestrationFlow[] {
    return Array.from(this.flows.values()).filter(
      (flow) => flow.status === 'RUNNING'
    );
  }
}
