import { Logger } from 'winston';
import Redis from 'ioredis';
import { PricingRule, PricingRequest } from '../../../../libs/shared/types';

export class PricingRuleService {
  private readonly RULE_KEY_PREFIX = 'pricing:rules:';
  private readonly ACTIVE_RULES_KEY = 'pricing:active_rules';

  constructor(private readonly redis: Redis, private readonly logger: Logger) {}

  async createRule(rule: Omit<PricingRule, 'id'>): Promise<PricingRule> {
    const id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullRule: PricingRule = { ...rule, id };

    await this.saveRule(fullRule);
    this.logger.info('Pricing rule created', {
      ruleId: id,
      ruleName: rule.name,
    });

    return fullRule;
  }

  async updateRule(rule: PricingRule): Promise<PricingRule> {
    await this.saveRule(rule);
    this.logger.info('Pricing rule updated', {
      ruleId: rule.id,
      ruleName: rule.name,
    });

    return rule;
  }

  async upsertRule(
    rule: Partial<PricingRule> & { id: string }
  ): Promise<PricingRule> {
    const existing = await this.getRule(rule.id);
    const fullRule: PricingRule = {
      ...existing,
      ...rule,
      id: rule.id,
    } as PricingRule;

    await this.saveRule(fullRule);
    this.logger.info('Pricing rule upserted', { ruleId: rule.id });

    return fullRule;
  }

  async getRule(id: string): Promise<PricingRule | null> {
    try {
      const ruleData = await this.redis.hget(this.RULE_KEY_PREFIX + id, 'data');
      if (!ruleData) return null;

      return JSON.parse(ruleData);
    } catch (error) {
      this.logger.error('Failed to get pricing rule', {
        ruleId: id,
        error: error.message,
      });
      return null;
    }
  }

  async deleteRule(id: string): Promise<boolean> {
    try {
      const deleted = await this.redis.del(this.RULE_KEY_PREFIX + id);
      await this.redis.srem(this.ACTIVE_RULES_KEY, id);

      this.logger.info('Pricing rule deleted', { ruleId: id });
      return deleted > 0;
    } catch (error) {
      this.logger.error('Failed to delete pricing rule', {
        ruleId: id,
        error: error.message,
      });
      return false;
    }
  }

  async getActiveRules(): Promise<PricingRule[]> {
    try {
      const activeRuleIds = await this.redis.smembers(this.ACTIVE_RULES_KEY);
      const rules: PricingRule[] = [];

      for (const id of activeRuleIds) {
        const rule = await this.getRule(id);
        if (rule && this.isRuleActive(rule)) {
          rules.push(rule);
        } else if (rule && !this.isRuleActive(rule)) {
          // Remove inactive rules from active set
          await this.redis.srem(this.ACTIVE_RULES_KEY, id);
        }
      }

      return rules.sort((a, b) => a.priority - b.priority);
    } catch (error) {
      this.logger.error('Failed to get active pricing rules', {
        error: error.message,
      });
      return [];
    }
  }

  async getApplicableRules(request: PricingRequest): Promise<PricingRule[]> {
    try {
      const activeRules = await this.getActiveRules();
      const applicableRules: PricingRule[] = [];

      for (const rule of activeRules) {
        if (this.isRuleApplicable(rule, request)) {
          applicableRules.push(rule);
        }
      }

      this.logger.debug('Found applicable pricing rules', {
        count: applicableRules.length,
        ruleIds: applicableRules.map((r) => r.id),
      });

      return applicableRules;
    } catch (error) {
      this.logger.error('Failed to get applicable pricing rules', {
        error: error.message,
      });
      return [];
    }
  }

  async getAllRules(): Promise<PricingRule[]> {
    try {
      const pattern = this.RULE_KEY_PREFIX + '*';
      const keys = await this.redis.keys(pattern);
      const rules: PricingRule[] = [];

      for (const key of keys) {
        const ruleData = await this.redis.hget(key, 'data');
        if (ruleData) {
          rules.push(JSON.parse(ruleData));
        }
      }

      return rules.sort((a, b) => a.priority - b.priority);
    } catch (error) {
      this.logger.error('Failed to get all pricing rules', {
        error: error.message,
      });
      return [];
    }
  }

  async activateRule(id: string): Promise<boolean> {
    try {
      const rule = await this.getRule(id);
      if (!rule) return false;

      rule.isActive = true;
      await this.saveRule(rule);

      this.logger.info('Pricing rule activated', { ruleId: id });
      return true;
    } catch (error) {
      this.logger.error('Failed to activate pricing rule', {
        ruleId: id,
        error: error.message,
      });
      return false;
    }
  }

  async deactivateRule(id: string): Promise<boolean> {
    try {
      const rule = await this.getRule(id);
      if (!rule) return false;

      rule.isActive = false;
      await this.saveRule(rule);
      await this.redis.srem(this.ACTIVE_RULES_KEY, id);

      this.logger.info('Pricing rule deactivated', { ruleId: id });
      return true;
    } catch (error) {
      this.logger.error('Failed to deactivate pricing rule', {
        ruleId: id,
        error: error.message,
      });
      return false;
    }
  }

  async getRulesByType(type: PricingRule['type']): Promise<PricingRule[]> {
    try {
      const allRules = await this.getActiveRules();
      return allRules.filter((rule) => rule.type === type);
    } catch (error) {
      this.logger.error('Failed to get rules by type', {
        type,
        error: error.message,
      });
      return [];
    }
  }

  async cleanupExpiredRules(): Promise<number> {
    try {
      const allRules = await this.getAllRules();
      const now = new Date();
      let cleanedCount = 0;

      for (const rule of allRules) {
        if (rule.validTo && rule.validTo < now) {
          await this.deleteRule(rule.id);
          cleanedCount++;
        }
      }

      this.logger.info('Expired pricing rules cleaned up', {
        count: cleanedCount,
      });
      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired rules', {
        error: error.message,
      });
      return 0;
    }
  }

  private async saveRule(rule: PricingRule): Promise<void> {
    const key = this.RULE_KEY_PREFIX + rule.id;

    await this.redis.hmset(key, {
      data: JSON.stringify(rule),
      type: rule.type,
      isActive: rule.isActive ? '1' : '0',
      priority: rule.priority.toString(),
      validFrom: rule.validFrom.toISOString(),
      validTo: rule.validTo?.toISOString() || '',
    });

    // Add to active rules set if active
    if (rule.isActive && this.isRuleActive(rule)) {
      await this.redis.sadd(this.ACTIVE_RULES_KEY, rule.id);
    } else {
      await this.redis.srem(this.ACTIVE_RULES_KEY, rule.id);
    }
  }

  private isRuleActive(rule: PricingRule): boolean {
    if (!rule.isActive) return false;

    const now = new Date();

    if (rule.validFrom > now) return false;
    if (rule.validTo && rule.validTo < now) return false;

    return true;
  }

  private isRuleApplicable(
    rule: PricingRule,
    request: PricingRequest
  ): boolean {
    if (!this.isRuleActive(rule)) return false;

    // Check conditions
    const conditions = rule.conditions || {};

    // Room type condition
    if (conditions.roomType && conditions.roomType !== request.roomType) {
      return false;
    }

    // Customer tier condition
    if (
      conditions.customerTier &&
      conditions.customerTier !== request.customerTier
    ) {
      return false;
    }

    // Guest count condition
    if (conditions.minGuests && request.guestCount < conditions.minGuests) {
      return false;
    }
    if (conditions.maxGuests && request.guestCount > conditions.maxGuests) {
      return false;
    }

    // Date range conditions
    if (conditions.checkInAfter) {
      const checkInAfter = new Date(conditions.checkInAfter);
      if (request.checkInDate < checkInAfter) return false;
    }

    if (conditions.checkInBefore) {
      const checkInBefore = new Date(conditions.checkInBefore);
      if (request.checkInDate > checkInBefore) return false;
    }

    // Day of week condition
    if (conditions.daysOfWeek) {
      const dayOfWeek = request.checkInDate.getDay();
      if (!conditions.daysOfWeek.includes(dayOfWeek)) return false;
    }

    // Hour condition
    if (conditions.hours) {
      const hour = request.checkInDate.getHours();
      if (!conditions.hours.includes(hour)) return false;
    }

    // Promo code condition
    if (conditions.promoCodes) {
      if (
        !request.promoCode ||
        !conditions.promoCodes.includes(request.promoCode)
      ) {
        return false;
      }
    }

    // Service ID condition
    if (
      conditions.serviceIds &&
      !conditions.serviceIds.includes(request.serviceId)
    ) {
      return false;
    }

    return true;
  }
}
