/**
 * Health Check Controller
 * 
 * Endpoints for system health monitoring.
 */

import { Router, Request, Response } from 'express';
import { checkRedisHealth, getRedis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// ==================================================
// TYPES
// ==================================================

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    checks: {
        database: ComponentHealth;
        redis: ComponentHealth;
        queue: ComponentHealth;
    };
}

interface ComponentHealth {
    status: 'up' | 'down';
    latency_ms?: number;
    error?: string;
}

// ==================================================
// CONTROLLER
// ==================================================

export const healthRouter = Router();

/**
 * GET /health
 * 
 * Basic health check for load balancers.
 */
healthRouter.get('/', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /health/ready
 * 
 * Readiness check - all dependencies must be available.
 */
healthRouter.get('/ready', async (req: Request, res: Response) => {
    const checks = await performHealthChecks();

    const allUp = Object.values(checks).every(c => c.status === 'up');
    const status = allUp ? 'healthy' : 'unhealthy';

    res.status(allUp ? 200 : 503).json({
        status,
        timestamp: new Date().toISOString(),
        checks,
    });
});

/**
 * GET /health/live
 * 
 * Liveness check - is the process alive?
 */
healthRouter.get('/live', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
    });
});

/**
 * GET /health/details
 * 
 * Detailed health check with all component statuses.
 */
healthRouter.get('/details', async (req: Request, res: Response) => {
    const checks = await performHealthChecks();

    const allUp = Object.values(checks).every(c => c.status === 'up');
    const someUp = Object.values(checks).some(c => c.status === 'up');

    let status: HealthStatus['status'];
    if (allUp) {
        status = 'healthy';
    } else if (someUp) {
        status = 'degraded';
    } else {
        status = 'unhealthy';
    }

    const response: HealthStatus = {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
    };

    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    res.status(httpStatus).json(response);
});

// ==================================================
// HEALTH CHECK FUNCTIONS
// ==================================================

async function performHealthChecks(): Promise<HealthStatus['checks']> {
    const [database, redis, queue] = await Promise.all([
        checkDatabase(),
        checkRedis(),
        checkQueue(),
    ]);

    return { database, redis, queue };
}

async function checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
        return {
            status: 'up',
            latency_ms: Date.now() - start,
        };
    } catch (error) {
        logger.error({ error }, 'Database health check failed');
        return {
            status: 'down',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

async function checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
        const isHealthy = await checkRedisHealth();
        if (isHealthy) {
            return {
                status: 'up',
                latency_ms: Date.now() - start,
            };
        }
        return { status: 'down', error: 'Redis ping failed' };
    } catch (error) {
        logger.error({ error }, 'Redis health check failed');
        return {
            status: 'down',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

async function checkQueue(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
        // Check if we can connect to Redis (queue backend)
        const redis = getRedis();
        const info = await redis.info('server');
        if (info) {
            return {
                status: 'up',
                latency_ms: Date.now() - start,
            };
        }
        return { status: 'down', error: 'Queue backend unavailable' };
    } catch (error) {
        logger.error({ error }, 'Queue health check failed');
        return {
            status: 'down',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
