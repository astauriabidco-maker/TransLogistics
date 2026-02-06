/**
 * PricingService Implementation
 * 
 * Pure domain logic for pricing rules and calculations.
 * NO HTTP, NO WhatsApp, NO AI logic.
 */

import type { PrismaClient, PricingRule, Route } from '@prisma/client';
import type {
    IPricingService,
    CreatePricingRuleInput,
    CalculatePriceInput,
    GetPricingRulesFilter,
    PricingRuleDTO,
    PriceCalculationResult,
} from '../domain/services/pricing.service';
import type {
    ServiceContext,
    PaginationParams,
    PaginatedResult,
    Dimensions,
} from '../domain/types';
import {
    PricingRuleNotFoundError,
    RouteNotFoundError,
    NoPricingRuleError,
    ValidationError,
    ConflictError,
    InvalidStateError,
} from '../domain/errors';
import { logger } from '../lib/logger';

// ==================================================
// SERVICE IMPLEMENTATION
// ==================================================

export class PricingService implements IPricingService {
    constructor(private readonly prisma: PrismaClient) { }

    // --------------------------------------------------
    // CREATE RULE
    // --------------------------------------------------

    async createRule(
        input: CreatePricingRuleInput,
        ctx: ServiceContext
    ): Promise<PricingRuleDTO> {
        // Validate route exists
        const route = await this.prisma.route.findUnique({
            where: { id: input.routeId },
        });

        if (!route) {
            throw new RouteNotFoundError(input.routeId);
        }

        // Validate pricing values
        this.validatePricingValues(input);

        // Check for overlapping date ranges
        await this.checkDateOverlap(input);

        // Get next version number
        const latestRule = await this.prisma.pricingRule.findFirst({
            where: { routeId: input.routeId },
            orderBy: { version: 'desc' },
        });
        const nextVersion = (latestRule?.version ?? 0) + 1;

        // Create the rule
        const rule = await this.prisma.pricingRule.create({
            data: {
                routeId: input.routeId,
                version: nextVersion,
                status: 'DRAFT',
                basePriceXof: input.basePriceXof,
                pricePerKg: input.pricePerKg,
                pricePerCm3: input.pricePerCm3,
                minimumPriceXof: input.minimumPriceXof ?? 1000,
                maximumWeightKg: input.maximumWeightKg ?? 50,
                effectiveFrom: input.effectiveFrom,
                effectiveTo: input.effectiveTo ?? null,
                createdById: ctx.userId ?? 'system',
            },
        });

        logger.info('Created pricing rule', {
            ruleId: rule.id,
            routeId: input.routeId,
            version: nextVersion,
            requestId: ctx.requestId,
        });

        return this.toDTO(rule);
    }

    // --------------------------------------------------
    // ACTIVATE RULE
    // --------------------------------------------------

    async activateRule(
        ruleId: string,
        ctx: ServiceContext
    ): Promise<PricingRuleDTO> {
        const rule = await this.prisma.pricingRule.findUnique({
            where: { id: ruleId },
        });

        if (!rule) {
            throw new PricingRuleNotFoundError(ruleId);
        }

        if (rule.status !== 'DRAFT') {
            throw new InvalidStateError(rule.status, 'activate', ['DRAFT']);
        }

        // Transaction: supersede old active rule, activate this one
        const [, activatedRule] = await this.prisma.$transaction([
            // Supersede any currently active rules
            this.prisma.pricingRule.updateMany({
                where: {
                    routeId: rule.routeId,
                    status: 'ACTIVE',
                },
                data: {
                    status: 'SUPERSEDED',
                    effectiveTo: new Date(),
                },
            }),
            // Activate this rule
            this.prisma.pricingRule.update({
                where: { id: ruleId },
                data: {
                    status: 'ACTIVE',
                    activatedAt: new Date(),
                    activatedById: ctx.userId ?? 'system',
                },
            }),
        ]);

        logger.info('Activated pricing rule', {
            ruleId,
            routeId: rule.routeId,
            version: rule.version,
            requestId: ctx.requestId,
        });

        return this.toDTO(activatedRule);
    }

    // --------------------------------------------------
    // GET ACTIVE RULE
    // --------------------------------------------------

    async getActiveRuleForRoute(
        routeId: string,
        asOfDate?: Date
    ): Promise<PricingRuleDTO> {
        const effectiveDate = asOfDate ?? new Date();

        const rule = await this.prisma.pricingRule.findFirst({
            where: {
                routeId,
                status: 'ACTIVE',
                effectiveFrom: { lte: effectiveDate },
                OR: [
                    { effectiveTo: null },
                    { effectiveTo: { gte: effectiveDate } },
                ],
            },
            orderBy: { version: 'desc' },
        });

        if (!rule) {
            throw new NoPricingRuleError(routeId);
        }

        return this.toDTO(rule);
    }

    // --------------------------------------------------
    // GET RULE BY ID
    // --------------------------------------------------

    async getRuleById(ruleId: string): Promise<PricingRuleDTO> {
        const rule = await this.prisma.pricingRule.findUnique({
            where: { id: ruleId },
        });

        if (!rule) {
            throw new PricingRuleNotFoundError(ruleId);
        }

        return this.toDTO(rule);
    }

    // --------------------------------------------------
    // LIST RULES
    // --------------------------------------------------

    async listRules(
        filter: GetPricingRulesFilter,
        pagination: PaginationParams
    ): Promise<PaginatedResult<PricingRuleDTO>> {
        const where: Record<string, unknown> = {};

        if (filter.routeId) {
            where.routeId = filter.routeId;
        }
        if (filter.status) {
            where.status = filter.status;
        }
        if (filter.effectiveAt) {
            where.effectiveFrom = { lte: filter.effectiveAt };
            where.OR = [
                { effectiveTo: null },
                { effectiveTo: { gte: filter.effectiveAt } },
            ];
        }

        const [rules, total] = await Promise.all([
            this.prisma.pricingRule.findMany({
                where,
                skip: (pagination.page - 1) * pagination.limit,
                take: pagination.limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.pricingRule.count({ where }),
        ]);

        return {
            data: rules.map((r) => this.toDTO(r)),
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total,
                totalPages: Math.ceil(total / pagination.limit),
            },
        };
    }

    // --------------------------------------------------
    // CALCULATE PRICE
    // --------------------------------------------------

    async calculatePrice(
        input: CalculatePriceInput,
        ctx: ServiceContext
    ): Promise<PriceCalculationResult> {
        // Validate dimensions
        this.validateDimensions(input.dimensions);
        this.validateWeight(input.weightKg);

        // Get route to validate it exists
        const route = await this.prisma.route.findUnique({
            where: { id: input.routeId },
        });

        if (!route) {
            throw new RouteNotFoundError(input.routeId);
        }

        // Get active pricing rule
        const ruleDTO = await this.getActiveRuleForRoute(
            input.routeId,
            input.calculationDate
        );

        // Calculate volume
        const volumeCm3 = this.calculateVolume(input.dimensions);

        // Calculate price components
        const basePriceXof = ruleDTO.basePriceXof;
        const weightPriceXof = input.weightKg * ruleDTO.pricePerKg;
        const volumePriceXof = volumeCm3 * ruleDTO.pricePerCm3;

        // Total with minimum
        let totalPriceXof = basePriceXof + weightPriceXof + volumePriceXof;
        totalPriceXof = Math.max(totalPriceXof, ruleDTO.minimumPriceXof);

        // Round to nearest 100 XOF
        totalPriceXof = Math.ceil(totalPriceXof / 100) * 100;

        logger.info('Calculated price', {
            routeId: input.routeId,
            pricingRuleId: ruleDTO.id,
            weightKg: input.weightKg,
            volumeCm3,
            totalPriceXof,
            requestId: ctx.requestId,
        });

        return {
            pricingRuleId: ruleDTO.id,
            pricingRuleVersion: ruleDTO.version,
            breakdown: {
                basePriceXof,
                weightPriceXof,
                volumePriceXof,
                totalPriceXof,
            },
            dimensions: input.dimensions,
            weightKg: input.weightKg,
            volumeCm3,
            calculatedAt: new Date(),
        };
    }

    // --------------------------------------------------
    // RULE HISTORY
    // --------------------------------------------------

    async getRuleHistory(
        routeId: string,
        pagination: PaginationParams
    ): Promise<PaginatedResult<PricingRuleDTO>> {
        const [rules, total] = await Promise.all([
            this.prisma.pricingRule.findMany({
                where: { routeId },
                skip: (pagination.page - 1) * pagination.limit,
                take: pagination.limit,
                orderBy: { version: 'desc' },
            }),
            this.prisma.pricingRule.count({ where: { routeId } }),
        ]);

        return {
            data: rules.map((r) => this.toDTO(r)),
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total,
                totalPages: Math.ceil(total / pagination.limit),
            },
        };
    }

    // ==================================================
    // PRIVATE HELPERS
    // ==================================================

    private validatePricingValues(input: CreatePricingRuleInput): void {
        if (input.basePriceXof < 0) {
            throw new ValidationError('Base price cannot be negative', 'basePriceXof');
        }
        if (input.pricePerKg < 0) {
            throw new ValidationError('Price per kg cannot be negative', 'pricePerKg');
        }
        if (input.pricePerCm3 < 0) {
            throw new ValidationError('Price per cm³ cannot be negative', 'pricePerCm3');
        }
        if (input.effectiveTo && input.effectiveTo <= input.effectiveFrom) {
            throw new ValidationError(
                'Effective end date must be after start date',
                'effectiveTo'
            );
        }
    }

    private async checkDateOverlap(input: CreatePricingRuleInput): Promise<void> {
        const overlapping = await this.prisma.pricingRule.findFirst({
            where: {
                routeId: input.routeId,
                status: { in: ['DRAFT', 'ACTIVE'] },
                effectiveFrom: { lte: input.effectiveTo ?? new Date('2099-12-31') },
                OR: [
                    { effectiveTo: null },
                    { effectiveTo: { gte: input.effectiveFrom } },
                ],
            },
        });

        // We allow overlapping drafts, only error on overlapping active
        if (overlapping && overlapping.status === 'ACTIVE') {
            throw new ConflictError(
                `Date range overlaps with active pricing rule ${overlapping.id}`
            );
        }
    }

    private validateDimensions(dimensions: Dimensions): void {
        if (dimensions.lengthCm <= 0) {
            throw new ValidationError('Length must be positive', 'lengthCm');
        }
        if (dimensions.widthCm <= 0) {
            throw new ValidationError('Width must be positive', 'widthCm');
        }
        if (dimensions.heightCm <= 0) {
            throw new ValidationError('Height must be positive', 'heightCm');
        }
    }

    private validateWeight(weightKg: number): void {
        if (weightKg <= 0) {
            throw new ValidationError('Weight must be positive', 'weightKg');
        }
        if (weightKg > 100) {
            throw new ValidationError('Weight exceeds maximum (100 kg)', 'weightKg');
        }
    }

    private calculateVolume(dimensions: Dimensions): number {
        return dimensions.lengthCm * dimensions.widthCm * dimensions.heightCm;
    }

    private toDTO(rule: PricingRule): PricingRuleDTO {
        return {
            id: rule.id,
            routeId: rule.routeId,
            version: rule.version,
            status: rule.status as 'DRAFT' | 'ACTIVE' | 'SUPERSEDED',
            basePriceXof: Number(rule.basePriceXof),
            pricePerKg: Number(rule.pricePerKg),
            pricePerCm3: Number(rule.pricePerCm3),
            minimumPriceXof: Number(rule.minimumPriceXof),
            maximumWeightKg: Number(rule.maximumWeightKg),
            effectiveFrom: rule.effectiveFrom,
            effectiveTo: rule.effectiveTo,
            createdAt: rule.createdAt,
        };
    }
}
