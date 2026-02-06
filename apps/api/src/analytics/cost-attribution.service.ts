/**
 * Cost Attribution Service
 * 
 * Manages cost entries for margin calculation.
 * 
 * PRINCIPLES:
 * - Costs are stored per period and never retroactively modified
 * - Missing costs are explicitly flagged, never silently assumed
 * - All margin calculations show assumptions used
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { RouteCostType, Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

// ==================================================
// TYPES
// ==================================================

/**
 * Cost assumption levels - explicit about data quality
 */
export enum CostAssumptionLevel {
    /** Actual recorded cost */
    ACTUAL = 'ACTUAL',
    /** Estimated based on historical data */
    ESTIMATED = 'ESTIMATED',
    /** Pro-rated from aggregate cost */
    PRORATED = 'PRORATED',
    /** No cost data available */
    MISSING = 'MISSING',
}

/**
 * Cost breakdown by type
 */
export interface CostBreakdown {
    type: RouteCostType;
    amountXof: Decimal;
    assumptionLevel: CostAssumptionLevel;
    description?: string;
}

/**
 * Transparent margin calculation result
 */
export interface MarginCalculation {
    /** Gross revenue (confirmed payments) */
    revenueXof: Decimal;

    /** Total costs with breakdown */
    totalCostXof: Decimal;
    costBreakdown: CostBreakdown[];

    /** Calculated margin */
    grossMarginXof: Decimal;
    marginPercent: Decimal;

    /** Transparency flags */
    isComplete: boolean;
    assumptions: MarginAssumption[];

    /** Computation metadata */
    computedAt: Date;
    periodStart: Date;
    periodEnd: Date;
}

/**
 * Assumption used in margin calculation
 */
export interface MarginAssumption {
    type: 'COST_MISSING' | 'COST_ESTIMATED' | 'COST_PRORATED' | 'REVENUE_PARTIAL';
    affectedCostType?: RouteCostType;
    description: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Input for recording a cost entry
 */
export interface RecordCostInput {
    routeId: string;
    costType: RouteCostType;
    amountXof: number | Decimal;
    periodStart: Date;
    periodEnd: Date;
    description?: string;
    shipmentCount?: number;
    createdById?: string;
}

/**
 * Cost summary for a route and period
 */
export interface RouteCostSummary {
    routeId: string;
    periodStart: Date;
    periodEnd: Date;
    totalCostXof: Decimal;
    breakdown: CostBreakdown[];
    coveragePercent: number;
    missingCostTypes: RouteCostType[];
}

// ==================================================
// COST ATTRIBUTION SERVICE
// ==================================================

/**
 * Record a cost entry for a route/period.
 * Immutable - creates new record, never updates existing.
 */
export async function recordCost(input: RecordCostInput): Promise<string> {
    const entry = await prisma.routeCostEntry.create({
        data: {
            routeId: input.routeId,
            costType: input.costType,
            amountXof: new Decimal(input.amountXof.toString()),
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            description: input.description,
            shipmentCount: input.shipmentCount,
            createdById: input.createdById,
        },
    });

    logger.info({
        costId: entry.id,
        routeId: input.routeId,
        costType: input.costType,
        amountXof: input.amountXof.toString(),
        period: `${input.periodStart.toISOString()} - ${input.periodEnd.toISOString()}`,
    }, 'Cost entry recorded');

    return entry.id;
}

/**
 * Get cost summary for a route and period.
 * Explicitly flags missing cost types.
 */
export async function getRouteCostSummary(
    routeId: string,
    periodStart: Date,
    periodEnd: Date
): Promise<RouteCostSummary> {
    const entries = await prisma.routeCostEntry.findMany({
        where: {
            routeId,
            periodStart: { lte: periodEnd },
            periodEnd: { gte: periodStart },
        },
    });

    // Aggregate by cost type
    const byType = new Map<RouteCostType, Decimal>();
    for (const entry of entries) {
        const current = byType.get(entry.costType) ?? new Decimal(0);
        byType.set(entry.costType, current.add(entry.amountXof));
    }

    // Build breakdown with actual values
    const breakdown: CostBreakdown[] = [];
    let totalCost = new Decimal(0);

    for (const [type, amount] of byType) {
        breakdown.push({
            type,
            amountXof: amount,
            assumptionLevel: CostAssumptionLevel.ACTUAL,
        });
        totalCost = totalCost.add(amount);
    }

    // Identify missing cost types
    const allCostTypes = Object.values(RouteCostType);
    const presentTypes = new Set(byType.keys());
    const missingCostTypes = allCostTypes.filter(t => !presentTypes.has(t));

    // Coverage = percentage of cost types that have data
    // Note: This is a simple metric; some cost types may not apply to all routes
    const coveragePercent = (presentTypes.size / allCostTypes.length) * 100;

    return {
        routeId,
        periodStart,
        periodEnd,
        totalCostXof: totalCost,
        breakdown,
        coveragePercent,
        missingCostTypes,
    };
}

/**
 * Calculate margin with full transparency.
 * Never silently fills in missing costs.
 */
export async function calculateTransparentMargin(
    routeId: string,
    periodStart: Date,
    periodEnd: Date,
    revenueXof: Decimal
): Promise<MarginCalculation> {
    const costSummary = await getRouteCostSummary(routeId, periodStart, periodEnd);
    const assumptions: MarginAssumption[] = [];

    // Flag missing cost types
    const criticalCostTypes: RouteCostType[] = ['FUEL', 'DRIVER_WAGE', 'CUSTOMS'];
    const missingCritical = costSummary.missingCostTypes.filter(t =>
        criticalCostTypes.includes(t)
    );

    if (missingCritical.length > 0) {
        for (const costType of missingCritical) {
            assumptions.push({
                type: 'COST_MISSING',
                affectedCostType: costType,
                description: `No ${costType} cost data recorded for this period`,
                impact: 'HIGH',
            });
        }
    }

    // Flag optional missing cost types
    const optionalMissing = costSummary.missingCostTypes.filter(t =>
        !criticalCostTypes.includes(t)
    );
    if (optionalMissing.length > 0) {
        assumptions.push({
            type: 'COST_MISSING',
            description: `Optional costs not recorded: ${optionalMissing.join(', ')}`,
            impact: 'LOW',
        });
    }

    // Calculate margin
    const grossMarginXof = revenueXof.sub(costSummary.totalCostXof);
    const marginPercent = revenueXof.gt(0)
        ? grossMarginXof.div(revenueXof).mul(100)
        : new Decimal(0);

    // Determine completeness
    const isComplete = missingCritical.length === 0;

    return {
        revenueXof,
        totalCostXof: costSummary.totalCostXof,
        costBreakdown: costSummary.breakdown,
        grossMarginXof,
        marginPercent,
        isComplete,
        assumptions,
        computedAt: new Date(),
        periodStart,
        periodEnd,
    };
}

// ==================================================
// BATCH COST RECORDING
// ==================================================

/**
 * Record multiple cost entries in a batch.
 * Uses transaction for atomicity.
 */
export async function recordCostBatch(
    inputs: RecordCostInput[]
): Promise<string[]> {
    const ids: string[] = [];

    await prisma.$transaction(async (tx) => {
        for (const input of inputs) {
            const entry = await tx.routeCostEntry.create({
                data: {
                    routeId: input.routeId,
                    costType: input.costType,
                    amountXof: new Decimal(input.amountXof.toString()),
                    periodStart: input.periodStart,
                    periodEnd: input.periodEnd,
                    description: input.description,
                    shipmentCount: input.shipmentCount,
                    createdById: input.createdById,
                },
            });
            ids.push(entry.id);
        }
    });

    logger.info({ count: ids.length }, 'Cost batch recorded');
    return ids;
}

// ==================================================
// COST ESTIMATION (EXPLICIT)
// ==================================================

/**
 * Estimate costs based on historical data.
 * Returns estimates with ESTIMATED assumption level.
 * NEVER automatically records - must be explicitly approved.
 */
export async function estimateCostsFromHistory(
    routeId: string,
    periodStart: Date,
    periodEnd: Date,
    lookbackDays: number = 30
): Promise<CostBreakdown[]> {
    const lookbackStart = new Date(periodStart);
    lookbackStart.setDate(lookbackStart.getDate() - lookbackDays);

    // Get historical costs for this route
    const historicalEntries = await prisma.routeCostEntry.findMany({
        where: {
            routeId,
            periodStart: { gte: lookbackStart },
            periodEnd: { lt: periodStart },
        },
    });

    if (historicalEntries.length === 0) {
        logger.warn({ routeId, lookbackDays }, 'No historical cost data for estimation');
        return [];
    }

    // Calculate average cost per type
    const avgByType = new Map<RouteCostType, { total: Decimal; count: number }>();

    for (const entry of historicalEntries) {
        const existing = avgByType.get(entry.costType) ?? { total: new Decimal(0), count: 0 };
        avgByType.set(entry.costType, {
            total: existing.total.add(entry.amountXof),
            count: existing.count + 1,
        });
    }

    const estimates: CostBreakdown[] = [];
    for (const [type, { total, count }] of avgByType) {
        const avgAmount = total.div(count);
        estimates.push({
            type,
            amountXof: avgAmount,
            assumptionLevel: CostAssumptionLevel.ESTIMATED,
            description: `Estimated from ${count} historical entries (${lookbackDays} day lookback)`,
        });
    }

    return estimates;
}

// ==================================================
// DISPATCH COST ATTRIBUTION
// ==================================================

/**
 * Calculate per-delivery dispatch cost.
 * Prorates route costs across shipments.
 */
export async function calculateDispatchCost(
    routeId: string,
    periodStart: Date,
    periodEnd: Date,
    shipmentCount: number
): Promise<{ costPerDeliveryXof: Decimal; assumption: MarginAssumption | null }> {
    if (shipmentCount === 0) {
        return {
            costPerDeliveryXof: new Decimal(0),
            assumption: null,
        };
    }

    const costSummary = await getRouteCostSummary(routeId, periodStart, periodEnd);

    // Prorate total cost across shipments
    const costPerDelivery = costSummary.totalCostXof.div(shipmentCount);

    // Flag if this is a proration
    const assumption: MarginAssumption | null = costSummary.totalCostXof.gt(0)
        ? {
            type: 'COST_PRORATED',
            description: `Route cost prorated across ${shipmentCount} shipments`,
            impact: 'MEDIUM',
        }
        : null;

    return {
        costPerDeliveryXof: costPerDelivery,
        assumption,
    };
}
