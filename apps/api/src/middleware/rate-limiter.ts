import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../lib/redis';
import { logger } from '../lib/logger';

// ==================================================
// RATE LIMITER — Redis-backed sliding window
// ==================================================

/**
 * Rate Limiter Configuration
 * 
 * Uses Redis sorted sets for a sliding window counter.
 * No external package dependency — pure ioredis implementation.
 */

interface RateLimitConfig {
    /** Identifier for this limiter (used in Redis key prefix & response headers) */
    name: string;
    /** Time window in milliseconds */
    windowMs: number;
    /** Maximum requests allowed in window */
    max: number;
    /** Custom key extractor (default: IP address) */
    keyGenerator?: (req: Request) => string;
    /** Custom message when limit is exceeded */
    message?: string;
    /** Skip rate limiting in certain conditions */
    skip?: (req: Request) => boolean;
}

// ==================================================
// PRESET CONFIGURATIONS
// ==================================================

export const RATE_LIMIT_PRESETS = {
    /** Global API: 100 requests per 15 minutes */
    global: {
        name: 'global',
        windowMs: 15 * 60 * 1000,
        max: 100,
    },
    /** Webhooks: 50 requests per minute (payment providers) */
    webhooks: {
        name: 'webhooks',
        windowMs: 1 * 60 * 1000,
        max: 50,
    },
    /** Authentication: 5 attempts per 15 minutes */
    auth: {
        name: 'auth',
        windowMs: 15 * 60 * 1000,
        max: 5,
    },
    /** Scan requests: 10 per minute */
    scan: {
        name: 'scan',
        windowMs: 1 * 60 * 1000,
        max: 10,
    },
    /** WhatsApp bot: 30 messages per minute */
    whatsapp: {
        name: 'whatsapp',
        windowMs: 1 * 60 * 1000,
        max: 30,
    },
    /** Admin/analytics: 200 per 15 minutes (higher for dashboard) */
    admin: {
        name: 'admin',
        windowMs: 15 * 60 * 1000,
        max: 200,
    },
    /** Admin per-user: 150 per 15 minutes, keyed by user identity */
    adminPerUser: {
        name: 'admin-user',
        windowMs: 15 * 60 * 1000,
        max: 150,
        keyGenerator: (req: Request) => (req.headers['x-user-id'] as string) || req.ip || 'anon',
    },
} as const satisfies Record<string, RateLimitConfig>;

// ==================================================
// RATE LIMITER MIDDLEWARE FACTORY
// ==================================================

/**
 * Creates an Express middleware that enforces rate limiting
 * using a Redis-backed sliding window algorithm.
 * 
 * Headers set on every response:
 * - X-RateLimit-Limit: max requests allowed
 * - X-RateLimit-Remaining: requests remaining in window
 * - X-RateLimit-Reset: epoch seconds when window resets
 * - Retry-After: seconds to wait (only on 429)
 */
export function createRateLimiter(config: RateLimitConfig) {
    const {
        name,
        windowMs,
        max,
        keyGenerator = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown',
        message = 'Too many requests, please try again later.',
        skip,
    } = config;

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        // Skip if configured
        if (skip?.(req)) {
            next();
            return;
        }

        try {
            const redis = getRedis();
            const key = `rl:${name}:${keyGenerator(req)}`;
            const now = Date.now();
            const windowStart = now - windowMs;

            // Sliding window: use sorted set with timestamp as score
            const multi = redis.multi();
            multi.zremrangebyscore(key, 0, windowStart);   // Remove expired entries
            multi.zadd(key, now, `${now}:${Math.random()}`); // Add current request
            multi.zcard(key);                                // Count entries in window
            multi.pexpire(key, windowMs);                    // Set TTL

            const results = await multi.exec();

            if (!results) {
                // Redis transaction failed, allow request through
                logger.warn({ limiter: name }, 'Rate limiter Redis transaction failed — allowing request');
                next();
                return;
            }

            const requestCount = results[2]?.[1] as number;
            const remaining = Math.max(0, max - requestCount);
            const resetEpochSeconds = Math.ceil((now + windowMs) / 1000);

            // Set headers on every response
            res.setHeader('X-RateLimit-Limit', max);
            res.setHeader('X-RateLimit-Remaining', remaining);
            res.setHeader('X-RateLimit-Reset', resetEpochSeconds);

            if (requestCount > max) {
                const retryAfterSeconds = Math.ceil(windowMs / 1000);
                res.setHeader('Retry-After', retryAfterSeconds);

                logger.warn(
                    { limiter: name, key: keyGenerator(req), requestCount, max },
                    'Rate limit exceeded'
                );

                res.status(429).json({
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message,
                        retryAfter: retryAfterSeconds,
                    },
                    meta: {
                        requestId: req.headers['x-request-id'] ?? 'unknown',
                        timestamp: new Date().toISOString(),
                    },
                });
                return;
            }

            next();
        } catch (error) {
            // Rate limiter failure should not block requests
            logger.error({ error, limiter: name }, 'Rate limiter error — allowing request');
            next();
        }
    };
}

// ==================================================
// PRE-BUILT MIDDLEWARE INSTANCES
// ==================================================

/** Global rate limiter — apply to all routes */
export const globalRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.global);

/** Webhook rate limiter — apply to /webhooks */
export const webhookRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.webhooks);

/** Auth rate limiter — apply to login/register routes */
export const authRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.auth);

/** Scan rate limiter — apply to scan request routes */
export const scanRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.scan);

/** WhatsApp rate limiter — apply to WhatsApp webhook */
export const whatsappRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.whatsapp);

/** Admin rate limiter — apply to admin/analytics routes */
export const adminRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.admin);

/** Admin per-user rate limiter — keyed by x-user-id header */
export const adminPerUserRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.adminPerUser);
