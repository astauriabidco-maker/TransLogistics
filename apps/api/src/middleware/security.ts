import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../lib/logger';
import { env } from '../config/env';

// ==================================================
// CORS CONFIGURATION
// ==================================================

/**
 * CORS Configuration for TransLogistics
 * 
 * Restricts origins to known frontends.
 * In development, allows localhost origins.
 */
export function getCorsOptions() {
    const allowedOrigins: string[] = [];

    if (env.NODE_ENV === 'development') {
        allowedOrigins.push(
            'http://localhost:3000',    // Next.js web dashboard
            'http://localhost:3001',    // API (for Swagger UI if added)
            'http://localhost:5173',    // Vite driver PWA
            'http://localhost:5174',    // Vite alternate port
        );
    }

    // Add production origins from env
    const productionOrigins = process.env['CORS_ALLOWED_ORIGINS'];
    if (productionOrigins) {
        allowedOrigins.push(...productionOrigins.split(',').map(o => o.trim()));
    }

    return {
        origin: env.NODE_ENV === 'development'
            ? true  // Allow all in dev
            : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    logger.warn({ origin }, 'CORS: blocked request from unknown origin');
                    callback(new Error('CORS: origin not allowed'));
                }
            },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Request-ID',
            'X-API-Key',
        ],
        exposedHeaders: [
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset',
            'Retry-After',
        ],
        maxAge: 600, // 10 minutes preflight cache
    };
}

// ==================================================
// HELMET CONFIGURATION (enhanced)
// ==================================================

/**
 * Enhanced Helmet configuration
 * 
 * Stricter than defaults for a financial logistics API.
 */
export function getHelmetOptions() {
    return {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameSrc: ["'none'"],
            },
        },
        crossOriginResourcePolicy: { policy: 'same-site' as const },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const },
    };
}

// ==================================================
// WEBHOOK SIGNATURE VERIFICATION
// ==================================================

/**
 * CinetPay Webhook Signature Verifier
 * 
 * Verifies that incoming webhooks are genuinely from CinetPay
 * using HMAC-SHA256 signature.
 */
export function verifyCinetPaySignature(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const signature = req.headers['x-cinetpay-signature'] as string | undefined;
    const secret = process.env['CINETPAY_SECRET_KEY'];

    if (!secret) {
        logger.warn('CINETPAY_SECRET_KEY not configured — skipping signature verification');
        next();
        return;
    }

    if (!signature) {
        logger.warn(
            { ip: req.ip, path: req.path },
            'CinetPay webhook missing signature header'
        );
        res.status(401).json({
            error: { code: 'WEBHOOK_UNAUTHORIZED', message: 'Missing signature' },
        });
        return;
    }

    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    if (!crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
    )) {
        logger.warn(
            { ip: req.ip, path: req.path },
            'CinetPay webhook signature mismatch'
        );
        res.status(401).json({
            error: { code: 'WEBHOOK_UNAUTHORIZED', message: 'Invalid signature' },
        });
        return;
    }

    next();
}

/**
 * Stripe Webhook Signature Verifier
 * 
 * Verifies webhook signatures using Stripe's standard algorithm.
 * Requires raw body (Buffer) for accurate signature computation.
 */
export function verifyStripeSignature(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const signature = req.headers['stripe-signature'] as string | undefined;
    const secret = process.env['STRIPE_WEBHOOK_SECRET'];

    if (!secret) {
        logger.warn('STRIPE_WEBHOOK_SECRET not configured — skipping signature verification');
        next();
        return;
    }

    if (!signature) {
        logger.warn(
            { ip: req.ip, path: req.path },
            'Stripe webhook missing signature header'
        );
        res.status(401).json({
            error: { code: 'WEBHOOK_UNAUTHORIZED', message: 'Missing signature' },
        });
        return;
    }

    // Parse Stripe signature header: t=timestamp,v1=signature
    const elements = signature.split(',');
    const timestampStr = elements.find(e => e.startsWith('t='))?.slice(2);
    const sig = elements.find(e => e.startsWith('v1='))?.slice(3);

    if (!timestampStr || !sig) {
        res.status(401).json({
            error: { code: 'WEBHOOK_UNAUTHORIZED', message: 'Malformed signature' },
        });
        return;
    }

    // Verify timestamp is within tolerance (5 minutes)
    const timestamp = parseInt(timestampStr, 10);
    const tolerance = 300; // 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
        logger.warn(
            { ip: req.ip, timestampDelta: now - timestamp },
            'Stripe webhook timestamp outside tolerance'
        );
        res.status(401).json({
            error: { code: 'WEBHOOK_UNAUTHORIZED', message: 'Timestamp out of tolerance' },
        });
        return;
    }

    // Compute expected signature
    const body = Buffer.isBuffer(req.body)
        ? req.body.toString('utf-8')
        : typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body);

    const payload = `${timestampStr}.${body}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    if (!crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature),
    )) {
        logger.warn(
            { ip: req.ip, path: req.path },
            'Stripe webhook signature mismatch'
        );
        res.status(401).json({
            error: { code: 'WEBHOOK_UNAUTHORIZED', message: 'Invalid signature' },
        });
        return;
    }

    next();
}

// ==================================================
// WEBHOOK CIRCUIT BREAKER
// ==================================================

/**
 * Simple circuit breaker for webhook flood protection.
 * 
 * If we receive > maxPerMinute webhooks for the same payment ID,
 * block further processing and alert.
 */
const webhookCounters = new Map<string, { count: number; firstSeen: number }>();

export function webhookCircuitBreaker(maxPerMinute: number = 100) {
    // Clean up old entries every 5 minutes
    setInterval(() => {
        const cutoff = Date.now() - 60_000;
        for (const [key, value] of webhookCounters) {
            if (value.firstSeen < cutoff) {
                webhookCounters.delete(key);
            }
        }
    }, 5 * 60_000);

    return (req: Request, res: Response, next: NextFunction): void => {
        // Extract payment ID from body (best effort)
        const paymentId = req.body?.cpm_trans_id
            ?? req.body?.data?.object?.id
            ?? req.body?.transaction_id
            ?? 'unknown';

        const key = `webhook:${paymentId}`;
        const now = Date.now();
        const entry = webhookCounters.get(key);

        if (entry) {
            // Reset window if older than 1 minute
            if (now - entry.firstSeen > 60_000) {
                webhookCounters.set(key, { count: 1, firstSeen: now });
            } else {
                entry.count++;
                if (entry.count > maxPerMinute) {
                    logger.error(
                        { paymentId, count: entry.count, maxPerMinute },
                        'Webhook circuit breaker triggered — possible replay attack or webhook loop'
                    );
                    res.status(429).json({
                        error: {
                            code: 'WEBHOOK_CIRCUIT_BREAKER',
                            message: 'Too many webhooks for this transaction',
                        },
                    });
                    return;
                }
            }
        } else {
            webhookCounters.set(key, { count: 1, firstSeen: now });
        }

        next();
    };
}

// ==================================================
// REQUEST ID MIDDLEWARE
// ==================================================

/**
 * Ensures every request has a unique X-Request-ID header.
 * Preserves client-provided IDs if present.
 */
export function requestIdMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
): void {
    if (!req.headers['x-request-id']) {
        req.headers['x-request-id'] = crypto.randomUUID();
    }
    next();
}
