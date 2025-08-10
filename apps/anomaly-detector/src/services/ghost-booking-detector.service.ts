import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../libs/shared/database';
import { Logger } from '../../../../libs/shared/utils';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export interface GhostBookingThresholds {
  holdTimeMinutes: number;
  maxUnpaidReservations: number;
  suspiciousPatternWindow: number; // hours
  maxSameGuestHolds: number;
  maxSameIPHolds: number;
}

export interface GhostBookingViolation {
  reservationId: string;
  guestId: string;
  violationType:
    | 'hold_timeout'
    | 'excessive_holds'
    | 'suspicious_pattern'
    | 'same_ip_abuse';
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: Record<string, any>;
  recommendedAction: 'auto_cancel' | 'flag_review' | 'block_guest' | 'escalate';
}

@Injectable()
export class GhostBookingDetectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
    private readonly actionQueue: Queue,
    private readonly logger: Logger
  ) {}

  /**
   * Get ghost booking thresholds from configuration
   */
  private async getThresholds(): Promise<GhostBookingThresholds> {
    const configs = await this.prisma.configurationParameter.findMany({
      where: {
        category: 'ghost_booking',
        isActive: true,
      },
    });

    const configMap = configs.reduce((acc, config) => {
      acc[config.key] = this.parseConfigValue(config.value, config.dataType);
      return acc;
    }, {} as Record<string, any>);

    return {
      holdTimeMinutes: configMap['ghost_booking.hold_time_minutes'] || 30,
      maxUnpaidReservations:
        configMap['ghost_booking.max_unpaid_reservations'] || 3,
      suspiciousPatternWindow:
        configMap['ghost_booking.suspicious_pattern_window'] || 24,
      maxSameGuestHolds: configMap['ghost_booking.max_same_guest_holds'] || 5,
      maxSameIPHolds: configMap['ghost_booking.max_same_ip_holds'] || 10,
    };
  }

  private parseConfigValue(value: string, dataType: string): any {
    switch (dataType) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value === 'true';
      case 'json':
        return JSON.parse(value);
      default:
        return value;
    }
  }

  /**
   * Detect ghost bookings across all reservation states
   */
  async detectGhostBookings(): Promise<GhostBookingViolation[]> {
    const violations: GhostBookingViolation[] = [];
    const thresholds = await this.getThresholds();

    this.logger.info('Starting ghost booking detection', { thresholds });

    // Check for hold timeouts
    const holdTimeoutViolations = await this.detectHoldTimeouts(thresholds);
    violations.push(...holdTimeoutViolations);

    // Check for excessive holds per guest
    const excessiveHoldsViolations = await this.detectExcessiveHolds(
      thresholds
    );
    violations.push(...excessiveHoldsViolations);

    // Check for suspicious patterns (same IP, similar timing)
    const suspiciousPatternViolations = await this.detectSuspiciousPatterns(
      thresholds
    );
    violations.push(...suspiciousPatternViolations);

    // Store violations in database
    await this.storeViolations(violations);

    this.logger.info('Ghost booking detection completed', {
      totalViolations: violations.length,
      holdTimeouts: holdTimeoutViolations.length,
      excessiveHolds: excessiveHoldsViolations.length,
      suspiciousPatterns: suspiciousPatternViolations.length,
    });

    return violations;
  }

  /**
   * Detect reservations held without payment beyond threshold
   */
  private async detectHoldTimeouts(
    thresholds: GhostBookingThresholds
  ): Promise<GhostBookingViolation[]> {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - thresholds.holdTimeMinutes);

    const expiredHolds = await this.prisma.reservation.findMany({
      where: {
        status: 'PENDING',
        bookedAt: {
          lt: cutoffTime,
        },
        payments: {
          none: {
            status: {
              in: ['COMPLETED', 'PROCESSING'],
            },
          },
        },
      },
      include: {
        guest: true,
        payments: true,
      },
    });

    return expiredHolds.map((reservation) => ({
      reservationId: reservation.id,
      guestId: reservation.guestId,
      violationType: 'hold_timeout' as const,
      severity: this.calculateSeverity(
        reservation.bookedAt,
        thresholds.holdTimeMinutes
      ),
      context: {
        bookedAt: reservation.bookedAt,
        holdDurationMinutes: Math.floor(
          (Date.now() - reservation.bookedAt.getTime()) / (1000 * 60)
        ),
        totalAmount: reservation.totalAmount,
        guestEmail: reservation.guest.email,
        failedPaymentAttempts: reservation.payments.filter(
          (p) => p.status === 'FAILED'
        ).length,
      },
      recommendedAction: this.determineAction(
        reservation.bookedAt,
        thresholds.holdTimeMinutes
      ),
    }));
  }

  /**
   * Detect guests with excessive unpaid reservations
   */
  private async detectExcessiveHolds(
    thresholds: GhostBookingThresholds
  ): Promise<GhostBookingViolation[]> {
    const windowStart = new Date();
    windowStart.setHours(
      windowStart.getHours() - thresholds.suspiciousPatternWindow
    );

    const guestHoldCounts = await this.prisma.reservation.groupBy({
      by: ['guestId'],
      where: {
        status: 'PENDING',
        bookedAt: {
          gte: windowStart,
        },
        payments: {
          none: {
            status: {
              in: ['COMPLETED', 'PROCESSING'],
            },
          },
        },
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gt: thresholds.maxSameGuestHolds,
          },
        },
      },
    });

    const violations: GhostBookingViolation[] = [];

    for (const guestData of guestHoldCounts) {
      const reservations = await this.prisma.reservation.findMany({
        where: {
          guestId: guestData.guestId,
          status: 'PENDING',
          bookedAt: {
            gte: windowStart,
          },
        },
        include: {
          guest: true,
        },
        orderBy: {
          bookedAt: 'desc',
        },
      });

      if (reservations.length > 0) {
        const latestReservation = reservations[0];
        violations.push({
          reservationId: latestReservation.id,
          guestId: guestData.guestId,
          violationType: 'excessive_holds',
          severity:
            guestData._count.id > thresholds.maxSameGuestHolds * 2
              ? 'critical'
              : 'high',
          context: {
            totalHolds: guestData._count.id,
            windowHours: thresholds.suspiciousPatternWindow,
            guestEmail: latestReservation.guest.email,
            reservationIds: reservations.map((r) => r.id),
            totalValue: reservations.reduce(
              (sum, r) => sum + Number(r.totalAmount),
              0
            ),
          },
          recommendedAction:
            guestData._count.id > thresholds.maxSameGuestHolds * 2
              ? 'block_guest'
              : 'flag_review',
        });
      }
    }

    return violations;
  }

  /**
   * Detect suspicious patterns (same IP, rapid bookings)
   */
  private async detectSuspiciousPatterns(
    thresholds: GhostBookingThresholds
  ): Promise<GhostBookingViolation[]> {
    const violations: GhostBookingViolation[] = [];
    const windowStart = new Date();
    windowStart.setHours(
      windowStart.getHours() - thresholds.suspiciousPatternWindow
    );

    // This would require IP tracking in reservations metadata
    // For now, we'll detect rapid booking patterns by guest
    const rapidBookings = await this.prisma.reservation.findMany({
      where: {
        status: 'PENDING',
        bookedAt: {
          gte: windowStart,
        },
      },
      include: {
        guest: true,
      },
      orderBy: {
        bookedAt: 'desc',
      },
    });

    // Group by guest and check for rapid sequential bookings
    const guestBookings = rapidBookings.reduce((acc, reservation) => {
      const guestId = reservation.guestId;
      if (!acc[guestId]) {
        acc[guestId] = [];
      }
      acc[guestId].push(reservation);
      return acc;
    }, {} as Record<string, typeof rapidBookings>);

    for (const [guestId, bookings] of Object.entries(guestBookings)) {
      if (bookings.length >= 3) {
        // Check if bookings were made within short time intervals
        const sortedBookings = bookings.sort(
          (a, b) => a.bookedAt.getTime() - b.bookedAt.getTime()
        );
        const intervals = [];

        for (let i = 1; i < sortedBookings.length; i++) {
          const interval =
            sortedBookings[i].bookedAt.getTime() -
            sortedBookings[i - 1].bookedAt.getTime();
          intervals.push(interval / (1000 * 60)); // Convert to minutes
        }

        const avgInterval =
          intervals.reduce((a, b) => a + b, 0) / intervals.length;

        if (avgInterval < 5) {
          // Less than 5 minutes between bookings
          violations.push({
            reservationId: sortedBookings[0].id,
            guestId,
            violationType: 'suspicious_pattern',
            severity: 'high',
            context: {
              bookingCount: bookings.length,
              averageIntervalMinutes: avgInterval,
              totalValue: bookings.reduce(
                (sum, r) => sum + Number(r.totalAmount),
                0
              ),
              guestEmail: bookings[0].guest.email,
              bookingTimes: bookings.map((b) => b.bookedAt),
            },
            recommendedAction: 'flag_review',
          });
        }
      }
    }

    return violations;
  }

  /**
   * Store violations in the database
   */
  private async storeViolations(
    violations: GhostBookingViolation[]
  ): Promise<void> {
    if (violations.length === 0) return;

    // Find or create the ghost booking policy rule
    let policyRule = await this.prisma.policyRule.findFirst({
      where: { code: 'ghost_booking_detector' },
    });

    if (!policyRule) {
      policyRule = await this.prisma.policyRule.create({
        data: {
          name: 'Ghost Booking Detector',
          code: 'ghost_booking_detector',
          ruleType: 'ghost_booking',
          condition: {
            type: 'automated_detection',
            description:
              'Detects bookings held without payment beyond thresholds',
          },
          action: {
            type: 'auto_cancel_or_flag',
            description: 'Automatically cancel or flag suspicious bookings',
          },
          priority: 50,
          source: 'system',
          createdBy: 'ghost-booking-detector',
        },
      });
    }

    const violationData = violations.map((violation) => ({
      policyRuleId: policyRule!.id,
      entityType: 'reservation',
      entityId: violation.reservationId,
      violationType: violation.violationType,
      severity: violation.severity,
      violationData: violation.context,
      actionTaken: null,
      isResolved: false,
    }));

    await this.prisma.policyViolation.createMany({
      data: violationData,
      skipDuplicates: true,
    });

    // Queue actions for high and critical violations
    const actionableViolations = violations.filter((v) =>
      ['high', 'critical'].includes(v.severity)
    );

    for (const violation of actionableViolations) {
      await this.queueAction(violation);
    }
  }

  /**
   * Queue actions for violations
   */
  private async queueAction(violation: GhostBookingViolation): Promise<void> {
    const actionType = violation.recommendedAction;

    await this.actionQueue.add('ghost-booking-action', {
      type: actionType,
      violationType: violation.violationType,
      reservationId: violation.reservationId,
      guestId: violation.guestId,
      severity: violation.severity,
      context: violation.context,
      timestamp: new Date().toISOString(),
    });

    this.logger.info('Queued ghost booking action', {
      actionType,
      reservationId: violation.reservationId,
      severity: violation.severity,
    });
  }

  private calculateSeverity(
    bookedAt: Date,
    thresholdMinutes: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const holdMinutes = Math.floor(
      (Date.now() - bookedAt.getTime()) / (1000 * 60)
    );

    if (holdMinutes > thresholdMinutes * 4) return 'critical';
    if (holdMinutes > thresholdMinutes * 2) return 'high';
    if (holdMinutes > thresholdMinutes * 1.5) return 'medium';
    return 'low';
  }

  private determineAction(
    bookedAt: Date,
    thresholdMinutes: number
  ): 'auto_cancel' | 'flag_review' | 'block_guest' | 'escalate' {
    const holdMinutes = Math.floor(
      (Date.now() - bookedAt.getTime()) / (1000 * 60)
    );

    if (holdMinutes > thresholdMinutes * 3) return 'auto_cancel';
    if (holdMinutes > thresholdMinutes * 2) return 'flag_review';
    return 'auto_cancel';
  }

  /**
   * Execute auto-cancel action for a reservation
   */
  async executeAutoCancel(
    reservationId: string,
    reason: string
  ): Promise<boolean> {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        include: { room: true, guest: true },
      });

      if (!reservation) {
        this.logger.warn('Reservation not found for auto-cancel', {
          reservationId,
        });
        return false;
      }

      if (reservation.status !== 'PENDING') {
        this.logger.info(
          'Reservation no longer in PENDING status, skipping auto-cancel',
          {
            reservationId,
            currentStatus: reservation.status,
          }
        );
        return false;
      }

      // Update reservation status
      await this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: 'ghost-booking-detector',
          cancellationReason: reason,
        },
      });

      // Release the room
      await this.prisma.room.update({
        where: { id: reservation.roomId },
        data: {
          status: 'AVAILABLE',
        },
      });

      // Mark violation as resolved
      await this.prisma.policyViolation.updateMany({
        where: {
          entityType: 'reservation',
          entityId: reservationId,
          isResolved: false,
        },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: 'ghost-booking-detector',
          actionTaken: 'auto_cancelled',
          actionResult: { success: true, reason },
        },
      });

      this.logger.info('Successfully auto-cancelled ghost booking', {
        reservationId,
        roomId: reservation.roomId,
        guestEmail: reservation.guest.email,
        reason,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to auto-cancel ghost booking', {
        reservationId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get ghost booking statistics
   */
  async getStatistics(windowHours: number = 24): Promise<Record<string, any>> {
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - windowHours);

    const [
      totalViolations,
      violationsByType,
      violationsBySeverity,
      resolvedViolations,
      autoCancelledCount,
    ] = await Promise.all([
      this.prisma.policyViolation.count({
        where: {
          policyRule: { code: 'ghost_booking_detector' },
          createdAt: { gte: windowStart },
        },
      }),
      this.prisma.policyViolation.groupBy({
        by: ['violationType'],
        where: {
          policyRule: { code: 'ghost_booking_detector' },
          createdAt: { gte: windowStart },
        },
        _count: { id: true },
      }),
      this.prisma.policyViolation.groupBy({
        by: ['severity'],
        where: {
          policyRule: { code: 'ghost_booking_detector' },
          createdAt: { gte: windowStart },
        },
        _count: { id: true },
      }),
      this.prisma.policyViolation.count({
        where: {
          policyRule: { code: 'ghost_booking_detector' },
          createdAt: { gte: windowStart },
          isResolved: true,
        },
      }),
      this.prisma.policyViolation.count({
        where: {
          policyRule: { code: 'ghost_booking_detector' },
          createdAt: { gte: windowStart },
          actionTaken: 'auto_cancelled',
        },
      }),
    ]);

    return {
      windowHours,
      totalViolations,
      resolvedViolations,
      autoCancelledCount,
      resolutionRate:
        totalViolations > 0 ? (resolvedViolations / totalViolations) * 100 : 0,
      violationsByType: violationsByType.reduce((acc, item) => {
        acc[item.violationType] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
      violationsBySeverity: violationsBySeverity.reduce((acc, item) => {
        acc[item.severity] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}
