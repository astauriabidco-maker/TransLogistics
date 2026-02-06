/**
 * PricingService Interface
 * 
 * Manages pricing rules and price calculations.
 * Enforces versioning and immutability constraints.
 */

import type { ServiceContext, Money, Dimensions, PaginatedResult, PaginationParams } from './types';

// ==================================================
// INPUT TYPES
// ==================================================

export interface CreatePricingRuleInput {
    routeId: string;
    basePriceXof: number;
    pricePerKg: number;
    pricePerCm3: number;
    minimumPriceXof?: number;
    maximumWeightKg?: number;
    effectiveFrom: Date;
    effectiveTo?: Date;
}

export interface CalculatePriceInput {
    routeId: string;
    dimensions: Dimensions;
    weightKg: number;
    calculationDate?: Date;
}

export interface GetPricingRulesFilter {
    routeId?: string;
    status?: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';
    effectiveAt?: Date;
}

// ==================================================
// OUTPUT TYPES
// ==================================================

export interface PricingRuleDTO {
    id: string;
    routeId: string;
    version: number;
    status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';
    basePriceXof: number;
    pricePerKg: number;
    pricePerCm3: number;
    minimumPriceXof: number;
    maximumWeightKg: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdAt: Date;
}

export interface PriceCalculationResult {
    pricingRuleId: string;
    pricingRuleVersion: number;
    breakdown: {
        basePriceXof: number;
        weightPriceXof: number;
        volumePriceXof: number;
        totalPriceXof: number;
    };
    dimensions: Dimensions;
    weightKg: number;
    volumeCm3: number;
    calculatedAt: Date;
}

// ==================================================
// SERVICE INTERFACE
// ==================================================

export interface IPricingService {
    /**
     * Create a new pricing rule for a route.
     * Auto-increments version based on existing rules.
     * 
     * @throws RouteNotFoundError - Route does not exist
     * @throws ValidationError - Invalid pricing values
     * @throws ConflictError - Overlapping date range with existing rule
     */
    createRule(
        input: CreatePricingRuleInput,
        ctx: ServiceContext
    ): Promise<PricingRuleDTO>;

    /**
     * Activate a draft pricing rule.
     * Supersedes any currently active rule for the same route.
     * 
     * @throws PricingRuleNotFoundError - Rule does not exist
     * @throws InvalidStateError - Rule is not in DRAFT state
     */
    activateRule(
        ruleId: string,
        ctx: ServiceContext
    ): Promise<PricingRuleDTO>;

    /**
     * Get the currently active pricing rule for a route.
     * 
     * @throws NoPricingRuleError - No active rule for this route
     */
    getActiveRuleForRoute(
        routeId: string,
        asOfDate?: Date
    ): Promise<PricingRuleDTO>;

    /**
     * Get a specific pricing rule by ID.
     * 
     * @throws PricingRuleNotFoundError - Rule does not exist
     */
    getRuleById(ruleId: string): Promise<PricingRuleDTO>;

    /**
     * List pricing rules with optional filtering.
     */
    listRules(
        filter: GetPricingRulesFilter,
        pagination: PaginationParams
    ): Promise<PaginatedResult<PricingRuleDTO>>;

    /**
     * Calculate price for given dimensions and weight.
     * Uses the active pricing rule for the route at the given date.
     * 
     * @throws RouteNotFoundError - Route does not exist
     * @throws NoPricingRuleError - No active rule for this route
     * @throws ValidationError - Invalid dimensions or weight
     */
    calculatePrice(
        input: CalculatePriceInput,
        ctx: ServiceContext
    ): Promise<PriceCalculationResult>;

    /**
     * Get pricing history for a route (all versions).
     */
    getRuleHistory(
        routeId: string,
        pagination: PaginationParams
    ): Promise<PaginatedResult<PricingRuleDTO>>;
}
