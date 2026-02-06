/**
 * Queue Configuration
 * 
 * Redis connection and BullMQ settings.
 */

export interface QueueConfig {
    redis: {
        host: string;
        port: number;
        password?: string;
        db?: number;
    };
    defaultJobOptions: {
        attempts: number;
        backoff: {
            type: 'exponential' | 'fixed';
            delay: number;
        };
        removeOnComplete: boolean;
        removeOnFail: boolean;
    };
}

/**
 * Get queue configuration from environment.
 */
export function getQueueConfig(): QueueConfig {
    return {
        redis: {
            host: process.env['REDIS_HOST'] ?? 'localhost',
            port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
            password: process.env['REDIS_PASSWORD'],
            db: parseInt(process.env['REDIS_DB'] ?? '0', 10),
        },
        defaultJobOptions: {
            attempts: parseInt(process.env['QUEUE_RETRY_ATTEMPTS'] ?? '3', 10),
            backoff: {
                type: 'exponential',
                delay: parseInt(process.env['QUEUE_RETRY_DELAY_MS'] ?? '1000', 10), // 1s, 2s, 4s
            },
            removeOnComplete: true,
            removeOnFail: false, // Keep failed jobs for debugging (30 days)
        },
    };
}

/**
 * Queue names.
 */
export const QUEUE_NAMES = {
    SCAN: 'scan-queue',
} as const;

/**
 * Job types.
 */
export const JOB_TYPES = {
    PROCESS_SCAN: 'process-scan',
} as const;
