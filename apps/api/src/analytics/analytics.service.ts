/**
 * Analytics Service
 * 
 * Orchestrates daily aggregation jobs.
 * Idempotent - can be safely re-run.
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { aggregateRoutePerformance } from './route-performance.aggregator';
import { aggregateHubPerformance } from './hub-performance.aggregator';
import { aggregateVolumeMetrics } from './volume-metrics.aggregator';
import { aggregateLeadSources } from './lead-source.aggregator';

// ==================================================
// TYPES
// ==================================================

export interface AggregationResult {
    success: boolean;
    recordsProcessed: number;
    snapshotsCreated: number;
    errors: string[];
    durationMs: number;
}

export interface DailyAggregationResult {
    date: Date;
    routePerformance: AggregationResult;
    hubPerformance: AggregationResult;
    volumeMetrics: AggregationResult;
    leadSources: AggregationResult;
    totalDurationMs: number;
}

// ==================================================
// MAIN ORCHESTRATOR
// ==================================================

/**
 * Run all daily aggregations for a specific date.
 * Idempotent - existing snapshots are replaced (upsert).
 */
export async function runDailyAggregation(
    targetDate: Date = getYesterday()
): Promise<DailyAggregationResult> {
    const startTime = Date.now();
    const dateStr = targetDate.toISOString().split('T')[0];

    logger.info({ targetDate: dateStr }, 'Starting daily analytics aggregation');

    // Run aggregations sequentially to avoid overloading DB
    const routePerformance = await safeAggregate(
        'routePerformance',
        () => aggregateRoutePerformance(targetDate)
    );

    const hubPerformance = await safeAggregate(
        'hubPerformance',
        () => aggregateHubPerformance(targetDate)
    );

    const volumeMetrics = await safeAggregate(
        'volumeMetrics',
        () => aggregateVolumeMetrics(targetDate)
    );

    const leadSources = await safeAggregate(
        'leadSources',
        () => aggregateLeadSources(targetDate)
    );

    const totalDurationMs = Date.now() - startTime;

    const result: DailyAggregationResult = {
        date: targetDate,
        routePerformance,
        hubPerformance,
        volumeMetrics,
        leadSources,
        totalDurationMs,
    };

    logger.info({
        targetDate: dateStr,
        totalDurationMs,
        routeSnapshots: routePerformance.snapshotsCreated,
        hubSnapshots: hubPerformance.snapshotsCreated,
        volumeSnapshots: volumeMetrics.snapshotsCreated,
        leadSnapshots: leadSources.snapshotsCreated,
    }, 'Daily analytics aggregation completed');

    return result;
}

/**
 * Backfill aggregations for a date range.
 * Useful for initial setup or recovery.
 */
export async function backfillAggregations(
    startDate: Date,
    endDate: Date
): Promise<DailyAggregationResult[]> {
    const results: DailyAggregationResult[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
        const result = await runDailyAggregation(new Date(current));
        results.push(result);
        current.setDate(current.getDate() + 1);
    }

    return results;
}

// ==================================================
// HELPERS
// ==================================================

function getYesterday(): Date {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(0, 0, 0, 0);
    return date;
}

async function safeAggregate(
    name: string,
    fn: () => Promise<AggregationResult>
): Promise<AggregationResult> {
    try {
        return await fn();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ aggregator: name, error: errorMessage }, 'Aggregation failed');
        return {
            success: false,
            recordsProcessed: 0,
            snapshotsCreated: 0,
            errors: [errorMessage],
            durationMs: 0,
        };
    }
}

// ==================================================
// QUERY HELPERS (for external use)
// ==================================================

/**
 * Get route performance for a date range.
 */
export async function getRoutePerformance(
    routeId: string,
    startDate: Date,
    endDate: Date
) {
    return prisma.routePerformanceSnapshot.findMany({
        where: {
            routeId,
            periodDay: {
                gte: startDate,
                lte: endDate,
            },
        },
        orderBy: { periodDay: 'asc' },
    });
}

/**
 * Get hub performance for a date range.
 */
export async function getHubPerformance(
    hubId: string,
    startDate: Date,
    endDate: Date
) {
    return prisma.hubPerformanceSnapshot.findMany({
        where: {
            hubId,
            periodDay: {
                gte: startDate,
                lte: endDate,
            },
        },
        orderBy: { periodDay: 'asc' },
    });
}

/**
 * Get lead source metrics for a date range.
 */
export async function getLeadSourceMetrics(
    startDate: Date,
    endDate: Date
) {
    return prisma.leadSourceSnapshot.findMany({
        where: {
            periodDay: {
                gte: startDate,
                lte: endDate,
            },
        },
        orderBy: [{ periodDay: 'asc' }, { leadSource: 'asc' }],
    });
}
