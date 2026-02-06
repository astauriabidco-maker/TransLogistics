/**
 * Scan Producer
 * 
 * Enqueues scan processing jobs to Redis/BullMQ.
 */

import { Queue, Job } from 'bullmq';
import { getQueueConfig, QUEUE_NAMES, JOB_TYPES } from './queue.config';
import type { ScanJobData } from './scan.job';
import { logger } from '../lib/logger';

// ==================================================
// PRODUCER
// ==================================================

export class ScanProducer {
    private queue: Queue;

    constructor() {
        const config = getQueueConfig();

        this.queue = new Queue(QUEUE_NAMES.SCAN, {
            connection: config.redis,
            defaultJobOptions: config.defaultJobOptions,
        });

        logger.info({ queueName: QUEUE_NAMES.SCAN }, 'ScanProducer initialized');
    }

    /**
     * Enqueue a scan processing job.
     * Uses scanRequestId as job ID for idempotency.
     */
    async enqueue(data: Omit<ScanJobData, 'attemptNumber'>): Promise<Job<ScanJobData>> {
        const jobData: ScanJobData = {
            ...data,
            attemptNumber: 1,
        };

        // Use scanRequestId as job ID for deduplication
        const job = await this.queue.add(
            JOB_TYPES.PROCESS_SCAN,
            jobData,
            {
                jobId: data.scanRequestId,
            }
        );

        logger.info({
            jobId: job.id,
            scanRequestId: data.scanRequestId,
            shipmentId: data.shipmentId,
        }, 'Scan job enqueued');

        return job;
    }

    /**
     * Get job status by request ID.
     */
    async getJobStatus(scanRequestId: string): Promise<{
        state: string;
        progress: number;
        failedReason?: string;
    } | null> {
        const job = await this.queue.getJob(scanRequestId);

        if (!job) {
            return null;
        }

        const state = await job.getState();

        return {
            state,
            progress: job.progress as number,
            failedReason: job.failedReason,
        };
    }

    /**
     * Retry a failed job.
     */
    async retry(scanRequestId: string): Promise<void> {
        const job = await this.queue.getJob(scanRequestId);

        if (job) {
            await job.retry();
            logger.info({ scanRequestId }, 'Scan job retried');
        }
    }

    /**
     * Close the queue connection.
     */
    async close(): Promise<void> {
        await this.queue.close();
    }
}
