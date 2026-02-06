/**
 * Volume Metrics Aggregator
 * 
 * Computes daily volume/weight delta metrics from:
 * - Quotes (declared vs volumetric vs payable weights)
 * - PricingRules (for revenue uplift calculation)
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AggregationResult } from './analytics.service';
import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

/**
 * Aggregate volume metrics for a specific date.
 * Measures the impact of VolumeScan AI on revenue.
 */
export async function aggregateVolumeMetrics(
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
            // Get quotes created on this day for this route
            const quotes = await prisma.quote.findMany({
                where: {
                    shipment: {
                        routeId: route.id,
                    },
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                    status: 'ACCEPTED',
                },
                include: {
                    pricingRule: true,
                },
            });

            recordsProcessed += quotes.length;

            if (quotes.length === 0) {
                continue; // Skip routes with no quotes
            }

            // Aggregate weight metrics
            let totalDeclaredWeight = new Decimal(0);
            let totalRealWeight = new Decimal(0);
            let totalVolumetricWeight = new Decimal(0);
            let totalPayableWeight = new Decimal(0);
            let totalVolumetricDelta = new Decimal(0);
            let underDeclaredCount = 0;
            let revenueUplift = new Decimal(0);

            for (const quote of quotes) {
                const declared = quote.declaredWeightKg ?? new Decimal(0);
                const real = quote.realWeightKg ?? new Decimal(0);
                const volumetric = quote.volumetricWeightKg;
                const payable = quote.payableWeightKg;

                totalDeclaredWeight = totalDeclaredWeight.add(declared);
                totalRealWeight = totalRealWeight.add(real);
                totalVolumetricWeight = totalVolumetricWeight.add(volumetric);
                totalPayableWeight = totalPayableWeight.add(payable);

                // Delta = volumetric - declared (positive = under-declared)
                const delta = volumetric.sub(declared);
                totalVolumetricDelta = totalVolumetricDelta.add(delta);

                if (delta.gt(0)) {
                    underDeclaredCount++;

                    // Revenue uplift = delta * pricePerKg
                    const pricePerKg = quote.pricingRule?.pricePerKg ?? new Decimal(0);
                    revenueUplift = revenueUplift.add(delta.mul(pricePerKg));
                }
            }

            const avgVolumetricDeltaKg = totalVolumetricDelta.div(quotes.length);
            const avgVolumetricDeltaPercent = totalDeclaredWeight.gt(0)
                ? avgVolumetricDeltaKg.div(totalDeclaredWeight.div(quotes.length)).mul(100)
                : new Decimal(0);

            // Upsert snapshot
            await prisma.volumeMetricsSnapshot.upsert({
                where: {
                    routeId_periodDay: {
                        routeId: route.id,
                        periodDay: startOfDay,
                    },
                },
                create: {
                    routeId: route.id,
                    periodDay: startOfDay,
                    shipmentCount: quotes.length,
                    totalDeclaredWeightKg: totalDeclaredWeight,
                    totalRealWeightKg: totalRealWeight,
                    totalVolumetricWeightKg: totalVolumetricWeight,
                    totalPayableWeightKg: totalPayableWeight,
                    avgVolumetricDeltaKg,
                    avgVolumetricDeltaPercent,
                    underDeclaredCount,
                    revenueUpliftXof: revenueUplift,
                },
                update: {
                    shipmentCount: quotes.length,
                    totalDeclaredWeightKg: totalDeclaredWeight,
                    totalRealWeightKg: totalRealWeight,
                    totalVolumetricWeightKg: totalVolumetricWeight,
                    totalPayableWeightKg: totalPayableWeight,
                    avgVolumetricDeltaKg,
                    avgVolumetricDeltaPercent,
                    underDeclaredCount,
                    revenueUpliftXof: revenueUplift,
                    computedAt: new Date(),
                },
            });

            snapshotsCreated++;
        } catch (error) {
            const msg = `Route ${route.code}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(msg);
            logger.error({ routeId: route.id, error: msg }, 'Volume metrics aggregation failed');
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
