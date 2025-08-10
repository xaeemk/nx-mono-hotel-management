import { Logger } from 'winston';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import {
  PricingRequest,
  PricingResponse,
  PricingRule,
  generateId,
} from '../../../../libs/shared/types';
import { PricingRuleService } from './pricing-rule.service';
import { config } from '../config/config';

export class PricingService {
  constructor(
    private readonly pricingRuleService: PricingRuleService,
    private readonly redis: Redis,
    private readonly pricingQueue: Queue,
    private readonly logger: Logger
  ) {}

  async calculatePrice(request: PricingRequest): Promise<PricingResponse> {
    const pricingId = generateId();
    this.logger.info('Calculating price', { pricingId, request });

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        this.logger.info('Price retrieved from cache', { pricingId });
        return JSON.parse(cached);
      }

      // Get applicable rules
      const rules = await this.pricingRuleService.getApplicableRules(request);

      // Start with base rate
      const baseRateRule = rules.find((rule) => rule.type === 'BASE_RATE');
      const baseRate =
        baseRateRule?.baseRate || this.getDefaultBaseRate(request.roomType);

      let finalPrice = baseRate;
      const appliedMultipliers: PricingResponse['appliedMultipliers'] = [];
      const breakdown: Record<string, number> = {
        base: baseRate,
      };

      // Apply multipliers in priority order
      const multiplierRules = rules
        .filter((rule) => rule.type !== 'BASE_RATE')
        .sort((a, b) => a.priority - b.priority);

      for (const rule of multiplierRules) {
        const multiplier = await this.calculateDynamicMultiplier(rule, request);
        const adjustment = finalPrice * (multiplier - 1);

        finalPrice *= multiplier;

        appliedMultipliers.push({
          ruleId: rule.id,
          ruleName: rule.name,
          multiplier,
          amount: adjustment,
        });

        breakdown[rule.name] = adjustment;
      }

      // Apply constraints
      finalPrice = Math.max(
        finalPrice,
        baseRate * config.pricing.minPriceMultiplier
      );
      finalPrice = Math.min(
        finalPrice,
        baseRate * config.pricing.maxPriceMultiplier
      );

      const response: PricingResponse = {
        baseRate,
        appliedMultipliers,
        finalPrice: Math.round(finalPrice * 100) / 100,
        currency: config.pricing.baseCurrency,
        breakdown,
        validUntil: new Date(
          Date.now() + config.pricing.cacheExpirationMinutes * 60 * 1000
        ),
        pricingId,
      };

      // Cache the result
      await this.redis.setex(
        cacheKey,
        config.pricing.cacheExpirationMinutes * 60,
        JSON.stringify(response)
      );

      this.logger.info('Price calculated successfully', {
        pricingId,
        baseRate,
        finalPrice: response.finalPrice,
      });

      return response;
    } catch (error) {
      this.logger.error('Failed to calculate price', {
        pricingId,
        error: error.message,
      });
      throw error;
    }
  }

  async updateDynamicPricing(): Promise<void> {
    this.logger.info('Starting dynamic pricing update');

    try {
      const now = new Date();
      const roomTypes = config.pricing.defaultRoomTypes;

      for (const roomType of roomTypes) {
        // Get current demand data
        const demandData = await this.getCurrentDemand(roomType);
        const occupancyRate = await this.getOccupancyRate(roomType);

        // Update demand-based multipliers
        await this.updateDemandMultipliers(roomType, demandData, occupancyRate);

        // Update time-based multipliers
        await this.updateTimeMultipliers(roomType, now);
      }

      this.logger.info('Dynamic pricing update completed');
    } catch (error) {
      this.logger.error('Dynamic pricing update failed', {
        error: error.message,
      });
      throw error;
    }
  }

  async updateSeasonalPricing(): Promise<void> {
    this.logger.info('Starting seasonal pricing update');

    try {
      const now = new Date();
      const seasonalMultiplier = this.calculateSeasonalMultiplier(now);

      // Update or create seasonal pricing rule
      await this.pricingRuleService.upsertRule({
        id: 'seasonal-multiplier',
        name: 'Seasonal Pricing',
        type: 'SEASONAL_MULTIPLIER',
        conditions: {
          season: this.getSeason(now),
          month: now.getMonth() + 1,
        },
        multiplier: seasonalMultiplier,
        priority: 10,
        isActive: true,
        validFrom: now,
        validTo: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      });

      this.logger.info('Seasonal pricing updated', {
        multiplier: seasonalMultiplier,
      });
    } catch (error) {
      this.logger.error('Seasonal pricing update failed', {
        error: error.message,
      });
      throw error;
    }
  }

  async analyzeDemandPatterns(): Promise<void> {
    this.logger.info('Starting demand pattern analysis');

    try {
      const endTime = new Date();
      const startTime = new Date(
        endTime.getTime() - config.pricing.demandWindowHours * 60 * 60 * 1000
      );

      // Analyze booking patterns
      const bookingData = await this.getBookingData(startTime, endTime);
      const patterns = this.identifyDemandPatterns(bookingData);

      // Store patterns for future pricing decisions
      await this.redis.hset(
        'demand:patterns',
        'latest',
        JSON.stringify({
          timestamp: endTime.toISOString(),
          patterns,
          validUntil: new Date(
            endTime.getTime() + 6 * 60 * 60 * 1000
          ).toISOString(),
        })
      );

      this.logger.info('Demand pattern analysis completed', {
        patternCount: Object.keys(patterns).length,
      });
    } catch (error) {
      this.logger.error('Demand pattern analysis failed', {
        error: error.message,
      });
      throw error;
    }
  }

  private async calculateDynamicMultiplier(
    rule: PricingRule,
    request: PricingRequest
  ): Promise<number> {
    let multiplier = rule.multiplier;

    switch (rule.type) {
      case 'DEMAND_MULTIPLIER':
        const demandMultiplier = await this.getDemandMultiplier(
          request.roomType
        );
        multiplier *= demandMultiplier;
        break;

      case 'TIME_MULTIPLIER':
        const timeMultiplier = this.getTimeMultiplier(request.checkInDate);
        multiplier *= timeMultiplier;
        break;

      case 'SEASONAL_MULTIPLIER':
        // Already calculated in rule multiplier
        break;
    }

    return multiplier;
  }

  private async getDemandMultiplier(roomType: string): Promise<number> {
    try {
      const demandKey = `demand:${roomType}`;
      const demandScore = await this.redis.get(demandKey);

      if (!demandScore) return 1.0;

      const score = parseFloat(demandScore);

      // Convert demand score (0-100) to multiplier (0.8-2.0)
      return 0.8 + (score / 100) * 1.2;
    } catch (error) {
      this.logger.warn('Failed to get demand multiplier, using default', {
        error: error.message,
      });
      return 1.0;
    }
  }

  private getTimeMultiplier(checkInDate: Date): number {
    const hour = checkInDate.getHours();
    const dayOfWeek = checkInDate.getDay();

    // Weekend premium
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      // Friday or Saturday
      return 1.2;
    }

    // Peak hours premium (6 PM - 10 PM)
    if (hour >= 18 && hour <= 22) {
      return 1.1;
    }

    // Off-peak discount (2 AM - 6 AM)
    if (hour >= 2 && hour <= 6) {
      return 0.9;
    }

    return 1.0;
  }

  private calculateSeasonalMultiplier(date: Date): number {
    const month = date.getMonth() + 1;
    const season = this.getSeason(date);

    // High season (December, January, February)
    if (season === 'winter') {
      return 1.3;
    }

    // Shoulder season (March, April, November)
    if (month === 3 || month === 4 || month === 11) {
      return 1.1;
    }

    // Low season (May - October)
    return 0.9;
  }

  private getSeason(date: Date): string {
    const month = date.getMonth() + 1;

    if (month >= 12 || month <= 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn';
  }

  private getDefaultBaseRate(roomType: string): number {
    const baseRates: Record<string, number> = {
      STANDARD: 5000,
      DELUXE: 8000,
      SUITE: 15000,
      PRESIDENTIAL: 25000,
    };

    return baseRates[roomType] || baseRates['STANDARD'];
  }

  private generateCacheKey(request: PricingRequest): string {
    const key = [
      'pricing',
      request.serviceId,
      request.roomType,
      request.checkInDate.toISOString().split('T')[0],
      request.checkOutDate.toISOString().split('T')[0],
      request.guestCount,
      request.customerTier || 'standard',
      request.promoCode || 'none',
    ].join(':');

    return key;
  }

  private async getCurrentDemand(roomType: string): Promise<any> {
    // Mock implementation - in real scenario, this would query booking database
    const randomDemand = Math.random() * 100;
    await this.redis.setex(`demand:${roomType}`, 3600, randomDemand.toString());
    return { score: randomDemand };
  }

  private async getOccupancyRate(roomType: string): Promise<number> {
    // Mock implementation - in real scenario, this would calculate from booking data
    return Math.random() * 0.8 + 0.1; // 10% - 90% occupancy
  }

  private async updateDemandMultipliers(
    roomType: string,
    demandData: any,
    occupancyRate: number
  ): Promise<void> {
    const multiplier =
      1.0 + occupancyRate * 0.5 + (demandData.score / 100) * 0.3;

    await this.pricingRuleService.upsertRule({
      id: `demand-${roomType}`,
      name: `Demand Pricing - ${roomType}`,
      type: 'DEMAND_MULTIPLIER',
      conditions: {
        roomType,
        occupancyRate,
        demandScore: demandData.score,
      },
      multiplier,
      priority: 20,
      isActive: true,
      validFrom: new Date(),
      validTo: new Date(Date.now() + 60 * 60 * 1000), // Valid for 1 hour
    });
  }

  private async updateTimeMultipliers(
    roomType: string,
    now: Date
  ): Promise<void> {
    const timeMultiplier = this.getTimeMultiplier(now);

    await this.pricingRuleService.upsertRule({
      id: `time-${roomType}-${now.getHours()}`,
      name: `Time-based Pricing - ${roomType}`,
      type: 'TIME_MULTIPLIER',
      conditions: {
        roomType,
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
      },
      multiplier: timeMultiplier,
      priority: 30,
      isActive: true,
      validFrom: now,
      validTo: new Date(now.getTime() + 60 * 60 * 1000), // Valid for 1 hour
    });
  }

  private async getBookingData(startTime: Date, endTime: Date): Promise<any[]> {
    // Mock implementation - in real scenario, this would query booking database
    const bookings = [];
    for (let i = 0; i < 50; i++) {
      bookings.push({
        id: generateId(),
        timestamp: new Date(
          startTime.getTime() +
            Math.random() * (endTime.getTime() - startTime.getTime())
        ),
        roomType:
          config.pricing.defaultRoomTypes[
            Math.floor(Math.random() * config.pricing.defaultRoomTypes.length)
          ],
        amount: Math.random() * 20000 + 5000,
      });
    }
    return bookings;
  }

  private identifyDemandPatterns(bookingData: any[]): Record<string, any> {
    const patterns: Record<string, any> = {};

    // Group by room type
    const byRoomType = bookingData.reduce((acc, booking) => {
      if (!acc[booking.roomType]) acc[booking.roomType] = [];
      acc[booking.roomType].push(booking);
      return acc;
    }, {});

    // Calculate patterns for each room type
    for (const [roomType, bookings] of Object.entries(byRoomType) as [
      string,
      any[]
    ][]) {
      const hourlyBookings = bookings.reduce((acc, booking) => {
        const hour = booking.timestamp.getHours();
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      patterns[roomType] = {
        totalBookings: bookings.length,
        averageAmount:
          bookings.reduce((sum, b) => sum + b.amount, 0) / bookings.length,
        peakHours: Object.entries(hourlyBookings)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 3)
          .map(([hour]) => parseInt(hour)),
      };
    }

    return patterns;
  }
}
