/**
 * Analytics Cron Jobs
 * 
 * Scheduled tasks for analytics aggregation:
 * - Daily performance snapshots (runs at 02:00 local time)
 * - Batch processing, idempotent
 */

import { CronJob } from 'cron';
import { runDailyAggregation, type DailyAggregationResult } from '../analytics/analytics.service';
import { logger } from '../lib/logger';

// ==================================================
// CRON JOBS
// ==================================================

let dailyAggregationCron: CronJob | null = null;

/**
 * Start analytics cron jobs.
 */
export function startAnalyticsCron(): void {
    // Run daily aggregation at 02:00 (processing yesterday's data)
    dailyAggregationCron = new CronJob(
        '0 2 * * *', // Every day at 02:00
        async () => {
            logger.info('Running daily analytics aggregation cron...');

            try {
                const result = await runDailyAggregation();

                logger.info({
                    date: result.date.toISOString().split('T')[0],
                    routeSnapshots: result.routePerformance.snapshotsCreated,
                    hubSnapshots: result.hubPerformance.snapshotsCreated,
                    volumeSnapshots: result.volumeMetrics.snapshotsCreated,
                    leadSnapshots: result.leadSources.snapshotsCreated,
                    totalDurationMs: result.totalDurationMs,
                }, 'Daily analytics aggregation completed');

                // Log any errors
                const allErrors = [
                    ...result.routePerformance.errors,
                    ...result.hubPerformance.errors,
                    ...result.volumeMetrics.errors,
                    ...result.leadSources.errors,
                ];

                if (allErrors.length > 0) {
                    logger.warn({ errors: allErrors }, 'Analytics aggregation had errors');
                }
            } catch (error) {
                logger.error({ error }, 'Daily analytics aggregation cron failed');
            }
        },
        null, // onComplete
        true, // start immediately
        'Africa/Abidjan' // Timezone (UTC+0, common for West Africa)
    );

    logger.info('Analytics cron jobs started');
}

/**
 * Stop analytics cron jobs.
 */
export function stopAnalyticsCron(): void {
    if (dailyAggregationCron) {
        dailyAggregationCron.stop();
        dailyAggregationCron = null;
    }

    logger.info('Analytics cron jobs stopped');
}

/**
 * Run daily aggregation manually (for testing or backfill).
 * @param targetDate Optional date to aggregate (defaults to yesterday)
 */
export async function runAnalyticsNow(targetDate?: Date): Promise<DailyAggregationResult> {
    logger.info({ targetDate: targetDate?.toISOString() }, 'Running analytics aggregation manually');
    return runDailyAggregation(targetDate);
}

/**
 * Check if analytics cron is running.
 */
export function isAnalyticsCronRunning(): boolean {
    return dailyAggregationCron !== null;
}
