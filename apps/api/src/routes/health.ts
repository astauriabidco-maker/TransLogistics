import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../lib/db';
import { checkRedisHealth } from '../lib/redis';
import { env } from '../config/env';

const router = Router();

interface HealthStatus {
    status: 'ok' | 'degraded' | 'unhealthy';
    service: string;
    version: string;
    timestamp: string;
    uptime: number;
    checks: {
        database: boolean;
        redis: boolean;
    };
}

/**
 * Health Check Endpoint
 * 
 * GET /health
 * 
 * Returns service health status including:
 * - Database connectivity
 * - Redis connectivity
 * - Service uptime
 */
router.get('/', async (_req: Request, res: Response) => {
    const startTime = process.hrtime();

    const [dbHealthy, redisHealthy] = await Promise.all([
        checkDatabaseHealth().catch(() => false),
        checkRedisHealth().catch(() => false),
    ]);

    const allHealthy = dbHealthy && redisHealthy;

    const healthStatus: HealthStatus = {
        status: allHealthy ? 'ok' : dbHealthy || redisHealthy ? 'degraded' : 'unhealthy',
        service: env.SERVICE_NAME,
        version: process.env['npm_package_version'] ?? '0.1.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
            database: dbHealthy,
            redis: redisHealthy,
        },
    };

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(healthStatus);
});

/**
 * Liveness Probe
 * 
 * GET /health/live
 * 
 * Simple check that the service is running.
 * Used by Kubernetes liveness probes.
 */
router.get('/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
});

/**
 * Readiness Probe
 * 
 * GET /health/ready
 * 
 * Checks if the service is ready to accept traffic.
 * Used by Kubernetes readiness probes.
 */
router.get('/ready', async (_req: Request, res: Response) => {
    const [dbHealthy, redisHealthy] = await Promise.all([
        checkDatabaseHealth().catch(() => false),
        checkRedisHealth().catch(() => false),
    ]);

    if (dbHealthy && redisHealthy) {
        res.status(200).json({ status: 'ready' });
    } else {
        res.status(503).json({
            status: 'not_ready',
            checks: { database: dbHealthy, redis: redisHealthy },
        });
    }
});

export default router;
