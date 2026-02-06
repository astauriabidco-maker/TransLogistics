/**
 * Route Performance Aggregator
 * 
 * Computes daily route performance metrics from:
 * - Shipments (delivered count, delivery time)
 * - Payments (revenue, refunds)
 * - Quotes (weight metrics)
 * - RouteCostEntry (costs for margin)
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AggregationResult } from './analytics.service';
import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

/**
 * Aggregate route performance for a specific date.
 * Upserts snapshots (idempotent).
 */
export async function aggregateRoutePerformance(
    targetDate: Date
): Promise<AggregationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let recordsProcessed = 0;
    let snapshotsCreated = 0;

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all active routes
    const routes = await prisma.route.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, code: true },
    });

    for (const route of routes) {
        try {
            // Get delivered shipments for this route on this day
            const shipments = await prisma.shipment.findMany({
                where: {
                    routeId: route.id,
                    status: 'DELIVERED',
                    deliveredAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
                include: {
                    quote: true,
                    payment: true,
                },
            });

            recordsProcessed += shipments.length;

            if (shipments.length === 0) {
                continue; // Skip routes with no deliveries
            }

            // Calculate revenue metrics
            let revenueXof = new Decimal(0);
            let refundsXof = new Decimal(0);
            let totalPayableWeight = new Decimal(0);
            let totalVolumetricWeight = new Decimal(0);
            let totalDeliveryDays = 0;
            let deliveryCount = 0;

            for (const shipment of shipments) {
                // Revenue from confirmed payments
                if (shipment.payment?.status === 'CONFIRMED') {
                    revenueXof = revenueXof.add(shipment.payment.amountXof);
                }
                if (shipment.payment?.status === 'REFUNDED') {
                    refundsXof = refundsXof.add(shipment.payment.amountXof);
                }

                // Weight metrics from quote
                if (shipment.quote) {
                    totalPayableWeight = totalPayableWeight.add(
                        shipment.quote.payableWeightKg
                    );
                    totalVolumetricWeight = totalVolumetricWeight.add(
                        shipment.quote.volumetricWeightKg
                    );
                }

                // Delivery time
                if (shipment.confirmedAt && shipment.deliveredAt) {
                    const days = Math.ceil(
                        (shipment.deliveredAt.getTime() - shipment.confirmedAt.getTime()) /
                        (1000 * 60 * 60 * 24)
                    );
                    totalDeliveryDays += days;
                    deliveryCount++;
                }
            }

            const netRevenueXof = revenueXof.sub(refundsXof);
            const avgDeliveryDays = deliveryCount > 0
                ? new Decimal(totalDeliveryDays).div(deliveryCount)
                : new Decimal(0);

            // Get costs for this route/period
            const costs = await prisma.routeCostEntry.findMany({
                where: {
                    routeId: route.id,
                    periodStart: { lte: endOfDay },
                    periodEnd: { gte: startOfDay },
                },
            });

            let totalCostXof = new Decimal(0);
            const costTypes = new Set<string>();
            for (const cost of costs) {
                totalCostXof = totalCostXof.add(cost.amountXof);
                costTypes.add(cost.costType);
            }

            const grossMarginXof = netRevenueXof.sub(totalCostXof);
            const marginPercent = netRevenueXof.gt(0)
                ? grossMarginXof.div(netRevenueXof).mul(100)
                : new Decimal(0);

            // Determine margin completeness - critical costs: FUEL, DRIVER_WAGE, CUSTOMS
            const criticalCosts = ['FUEL', 'DRIVER_WAGE', 'CUSTOMS'];
            const hasCriticalCosts = criticalCosts.every(c => costTypes.has(c));
            const isMarginComplete = hasCriticalCosts;

            // Build assumptions array
            const costAssumptions: { type: string; description: string; impact: string }[] = [];
            if (!hasCriticalCosts) {
                const missingCritical = criticalCosts.filter(c => !costTypes.has(c));
                for (const costType of missingCritical) {
                    costAssumptions.push({
                        type: 'COST_MISSING',
                        description: `No ${costType} cost data recorded for this period`,
                        impact: 'HIGH',
                    });
                }
            }
            if (totalCostXof.eq(0) && netRevenueXof.gt(0)) {
                costAssumptions.push({
                    type: 'COST_MISSING',
                    description: 'No cost data recorded - margin may be overstated',
                    impact: 'HIGH',
                });
            }

            // Upsert snapshot
            await prisma.routePerformanceSnapshot.upsert({
                where: {
                    routeId_periodDay: {
                        routeId: route.id,
                        periodDay: startOfDay,
                    },
                },
                create: {
                    routeId: route.id,
                    periodDay: startOfDay,
                    shipmentCount: shipments.length,
                    revenueXof,
                    refundsXof,
                    netRevenueXof,
                    totalCostXof,
                    grossMarginXof,
                    marginPercent,
                    isMarginComplete,
                    costAssumptions: costAssumptions.length > 0 ? costAssumptions : undefined,
                    totalPayableWeightKg: totalPayableWeight,
                    totalVolumetricWeightKg: totalVolumetricWeight,
                    avgDeliveryDays,
                },
                update: {
                    shipmentCount: shipments.length,
                    revenueXof,
                    refundsXof,
                    netRevenueXof,
                    totalCostXof,
                    grossMarginXof,
                    marginPercent,
                    isMarginComplete,
                    costAssumptions: costAssumptions.length > 0 ? costAssumptions : Prisma.DbNull,
                    totalPayableWeightKg: totalPayableWeight,
                    totalVolumetricWeightKg: totalVolumetricWeight,
                    avgDeliveryDays,
                    computedAt: new Date(),
                },
            });

            snapshotsCreated++;
        } catch (error) {
            const msg = `Route ${route.code}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(msg);
            logger.error({ routeId: route.id, error: msg }, 'Route aggregation failed');
        }
    }

    return {
        success: errors.length === 0,
        recordsProcessed,
        snapshotsCreated,
        errors,
        durationMs: Date.now() - startTime,
    };
}
