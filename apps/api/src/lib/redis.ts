import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Redis Connection Placeholder
 * 
 * This module provides Redis connection for:
 * - Session storage
 * - Caching
 * - Job queues (Bull/BullMQ)
 * 
 * Actual queue configuration will be added in feature phase.
 */

let redis: Redis | null = null;

export async function connectRedis(): Promise<void> {
    try {
        redis = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 3) {
                    logger.error('Redis connection failed after 3 retries');
                    return null;
                }
                return Math.min(times * 200, 2000);
            },
        });

        redis.on('connect', () => {
            logger.info('Redis connection established');
        });

        redis.on('error', (error) => {
            logger.error({ error }, 'Redis connection error');
        });

        // Test connection
        await redis.ping();
    } catch (error) {
        logger.error({ error }, 'Failed to connect to Redis');
        throw error;
    }
}

export async function disconnectRedis(): Promise<void> {
    if (redis) {
        await redis.quit();
        redis = null;
        logger.info('Redis connection closed');
    }
}

export function getRedis(): Redis {
    if (!redis) {
        throw new Error('Redis not initialized. Call connectRedis() first.');
    }
    return redis;
}

export async function checkRedisHealth(): Promise<boolean> {
    try {
        const pong = await getRedis().ping();
        return pong === 'PONG';
    } catch {
        return false;
    }
}
