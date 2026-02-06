/**
 * Hub Performance Aggregator
 * 
 * Computes daily hub performance metrics from:
 * - Shipments (originated/received via routes)
 * - ScanResults (scan quality metrics)
 * - Drivers (availability and delivery metrics)
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AggregationResult } from './analytics.service';
import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

/**
 * Aggregate hub performance for a specific date.
 * Upserts snapshots (idempotent).
 */
export async function aggregateHubPerformance(
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

    // Get all active hubs
    const hubs = await prisma.hub.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, code: true },
    });

    for (const hub of hubs) {
        try {
            // Get routes originating from this hub
            const originRoutes = await prisma.route.findMany({
                where: { originHubId: hub.id, status: 'ACTIVE' },
                select: { id: true },
            });
            const originRouteIds = originRoutes.map(r => r.id);

            // Get routes terminating at this hub
            const destRoutes = await prisma.route.findMany({
                where: { destinationHubId: hub.id, status: 'ACTIVE' },
                select: { id: true },
            });
            const destRouteIds = destRoutes.map(r => r.id);

            // Count shipments originated (created at this hub)
            const shipmentsOriginated = await prisma.shipment.count({
                where: {
                    routeId: { in: originRouteIds },
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            // Count shipments received (delivered at this hub)
            const shipmentsReceived = await prisma.shipment.count({
                where: {
                    routeId: { in: destRouteIds },
                    status: 'DELIVERED',
                    deliveredAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            recordsProcessed += shipmentsOriginated + shipmentsReceived;

            // Get scan results for this hub
            const scanResults = await prisma.scanResult.findMany({
                where: {
                    hubId: hub.id,
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
                select: {
                    confidenceScore: true,
                    requiresManualValidation: true,
                },
            });

            const scanCount = scanResults.length;
            let totalConfidence = new Decimal(0);
            let manualValidationCount = 0;

            for (const scan of scanResults) {
                if (scan.confidenceScore) {
                    totalConfidence = totalConfidence.add(scan.confidenceScore);
                }
                if (scan.requiresManualValidation) {
                    manualValidationCount++;
                }
            }

            const avgScanConfidence = scanCount > 0
                ? totalConfidence.div(scanCount)
                : new Decimal(0);
            const manualValidationRate = scanCount > 0
                ? new Decimal(manualValidationCount).div(scanCount)
                : new Decimal(0);

            // Get driver metrics for this hub
            // Count total ENROLLED drivers (not point-in-time availability)
            const activeDriverCount = await prisma.driver.count({
                where: {
                    hubId: hub.id,
                    status: 'ACTIVE',
                },
            });

            // Get dispatch task metrics
            const completedDeliveries = await prisma.dispatchTask.count({
                where: {
                    driver: { hubId: hub.id },
                    status: 'DELIVERED',
                    deliveredAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            });

            // Failed deliveries: count DISTINCT shipments that failed (not retry attempts)
            // DispatchTask has shipments via DispatchTaskShipment join table
            const failedTasksWithShipments = await prisma.dispatchTask.findMany({
                where: {
                    driver: { hubId: hub.id },
                    status: 'FAILED',
                    failedAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
                select: { shipments: { select: { shipmentId: true } } },
            });
            // Count unique shipment IDs across all failed tasks
            const failedShipmentIds = new Set<string>();
            for (const task of failedTasksWithShipments) {
                for (const ts of task.shipments) {
                    failedShipmentIds.add(ts.shipmentId);
                }
            }
            const failedDeliveries = failedShipmentIds.size;

            // Calculate hub financial metrics from route performance snapshots
            // Hub gets 50% allocation from routes where it's origin, 50% from routes where it's destination
            const allRouteIds = [...new Set([...originRouteIds, ...destRouteIds])];

            let hubRevenueXof = new Decimal(0);
            let hubCostXof = new Decimal(0);
            let hubMarginXof = new Decimal(0);
            let allMarginsComplete = true;

            if (allRouteIds.length > 0) {
                // Fetch route performance snapshots
                const routeSnapshots = await prisma.routePerformanceSnapshot.findMany({
                    where: {
                        routeId: { in: allRouteIds },
                        periodDay: startOfDay,
                    },
                });

                // Need to determine allocation per route - build a map of route origins/destinations
                const routeInfoMap = new Map<string, { originHubId: string; destinationHubId: string }>();
                for (const r of originRoutes) {
                    routeInfoMap.set(r.id, { originHubId: hub.id, destinationHubId: '' });
                }
                for (const r of destRoutes) {
                    const existing = routeInfoMap.get(r.id);
                    if (existing) {
                        existing.destinationHubId = hub.id;
                    } else {
                        routeInfoMap.set(r.id, { originHubId: '', destinationHubId: hub.id });
                    }
                }

                for (const snap of routeSnapshots) {
                    // Determine allocation percentage
                    // If hub is both origin AND destination (self-route), get 100%
                    // Otherwise, get 50% for origin role, 50% for destination role
                    const info = routeInfoMap.get(snap.routeId);
                    const isOrigin = info?.originHubId === hub.id;
                    const isDest = info?.destinationHubId === hub.id;
                    const allocation = (isOrigin && isDest) ? new Decimal(1) : new Decimal(0.5);

                    hubRevenueXof = hubRevenueXof.add(new Decimal(snap.netRevenueXof.toString()).mul(allocation));
                    hubCostXof = hubCostXof.add(new Decimal(snap.totalCostXof.toString()).mul(allocation));
                    hubMarginXof = hubMarginXof.add(new Decimal(snap.grossMarginXof.toString()).mul(allocation));

                    if (!snap.isMarginComplete) {
                        allMarginsComplete = false;
                    }
                }
            }

            const isMarginComplete = allMarginsComplete && allRouteIds.length > 0;

            // Upsert snapshot
            await prisma.hubPerformanceSnapshot.upsert({
                where: {
                    hubId_periodDay: {
                        hubId: hub.id,
                        periodDay: startOfDay,
                    },
                },
                create: {
                    hubId: hub.id,
                    periodDay: startOfDay,
                    shipmentsOriginated,
                    shipmentsReceived,
                    shipmentsThroughput: shipmentsOriginated + shipmentsReceived,
                    scanCount,
                    avgScanConfidence,
                    manualValidationCount,
                    manualValidationRate,
                    activeDriverCount,
                    completedDeliveries,
                    failedDeliveries,
                    revenueXof: hubRevenueXof,
                    costXof: hubCostXof,
                    marginXof: hubMarginXof,
                    isMarginComplete,
                },
                update: {
                    shipmentsOriginated,
                    shipmentsReceived,
                    shipmentsThroughput: shipmentsOriginated + shipmentsReceived,
                    scanCount,
                    avgScanConfidence,
                    manualValidationCount,
                    manualValidationRate,
                    activeDriverCount,
                    completedDeliveries,
                    failedDeliveries,
                    revenueXof: hubRevenueXof,
                    costXof: hubCostXof,
                    marginXof: hubMarginXof,
                    isMarginComplete,
                    computedAt: new Date(),
                },
            });

            snapshotsCreated++;
        } catch (error) {
            const msg = `Hub ${hub.code}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(msg);
            logger.error({ hubId: hub.id, error: msg }, 'Hub aggregation failed');
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
