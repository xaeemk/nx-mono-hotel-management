import { Router, Request, Response } from 'express';
import { Logger } from 'winston';
import { PricingService } from '../services/pricing.service';
import { PricingRequest } from '../../../../libs/shared/types';

export class PricingController {
  private router: Router;

  constructor(
    private readonly pricingService: PricingService,
    private readonly logger: Logger
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Calculate pricing
    this.router.post('/calculate', this.calculatePrice.bind(this));

    // Trigger manual pricing updates
    this.router.post('/update/dynamic', this.updateDynamicPricing.bind(this));
    this.router.post('/update/seasonal', this.updateSeasonalPricing.bind(this));

    // Demand analysis
    this.router.post('/analyze/demand', this.analyzeDemandPatterns.bind(this));

    // Health check
    this.router.get('/health', this.healthCheck.bind(this));
  }

  private async calculatePrice(req: Request, res: Response): Promise<void> {
    try {
      const pricingRequest: PricingRequest = {
        serviceId: req.body.serviceId,
        roomType: req.body.roomType,
        checkInDate: new Date(req.body.checkInDate),
        checkOutDate: new Date(req.body.checkOutDate),
        guestCount: req.body.guestCount,
        customerTier: req.body.customerTier,
        promoCode: req.body.promoCode,
        metadata: req.body.metadata,
      };

      // Validate request
      const validation = this.validatePricingRequest(pricingRequest);
      if (!validation.isValid) {
        res.status(400).json({
          error: 'Invalid pricing request',
          details: validation.errors,
        });
        return;
      }

      const pricing = await this.pricingService.calculatePrice(pricingRequest);

      this.logger.info('Pricing calculation completed', {
        pricingId: pricing.pricingId,
        serviceId: pricingRequest.serviceId,
        roomType: pricingRequest.roomType,
        finalPrice: pricing.finalPrice,
      });

      res.json({
        success: true,
        data: pricing,
      });
    } catch (error) {
      this.logger.error('Price calculation failed', { error: error.message });
      res.status(500).json({
        error: 'Failed to calculate price',
        message: error.message,
      });
    }
  }

  private async updateDynamicPricing(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      await this.pricingService.updateDynamicPricing();

      this.logger.info('Dynamic pricing update triggered manually');

      res.json({
        success: true,
        message: 'Dynamic pricing update completed',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Manual dynamic pricing update failed', {
        error: error.message,
      });
      res.status(500).json({
        error: 'Failed to update dynamic pricing',
        message: error.message,
      });
    }
  }

  private async updateSeasonalPricing(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      await this.pricingService.updateSeasonalPricing();

      this.logger.info('Seasonal pricing update triggered manually');

      res.json({
        success: true,
        message: 'Seasonal pricing update completed',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Manual seasonal pricing update failed', {
        error: error.message,
      });
      res.status(500).json({
        error: 'Failed to update seasonal pricing',
        message: error.message,
      });
    }
  }

  private async analyzeDemandPatterns(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      await this.pricingService.analyzeDemandPatterns();

      this.logger.info('Demand pattern analysis triggered manually');

      res.json({
        success: true,
        message: 'Demand pattern analysis completed',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Manual demand analysis failed', {
        error: error.message,
      });
      res.status(500).json({
        error: 'Failed to analyze demand patterns',
        message: error.message,
      });
    }
  }

  private async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      service: 'pricing-agent',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  }

  private validatePricingRequest(request: PricingRequest): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Required fields validation
    if (!request.serviceId) {
      errors.push('serviceId is required');
    }

    if (!request.roomType) {
      errors.push('roomType is required');
    }

    if (!request.checkInDate) {
      errors.push('checkInDate is required');
    }

    if (!request.checkOutDate) {
      errors.push('checkOutDate is required');
    }

    if (!request.guestCount || request.guestCount < 1) {
      errors.push('guestCount must be at least 1');
    }

    // Date validation
    if (request.checkInDate && request.checkOutDate) {
      if (request.checkInDate >= request.checkOutDate) {
        errors.push('checkOutDate must be after checkInDate');
      }

      if (request.checkInDate < new Date()) {
        errors.push('checkInDate cannot be in the past');
      }
    }

    // Business rules validation
    if (request.guestCount > 10) {
      errors.push('guestCount cannot exceed 10');
    }

    const validRoomTypes = ['STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL'];
    if (request.roomType && !validRoomTypes.includes(request.roomType)) {
      errors.push(`roomType must be one of: ${validRoomTypes.join(', ')}`);
    }

    const validCustomerTiers = ['STANDARD', 'PREMIUM', 'VIP'];
    if (
      request.customerTier &&
      !validCustomerTiers.includes(request.customerTier)
    ) {
      errors.push(
        `customerTier must be one of: ${validCustomerTiers.join(', ')}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  getRouter(): Router {
    return this.router;
  }
}
