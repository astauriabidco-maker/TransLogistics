/**
 * Webhook Controller
 * 
 * HTTP handlers for payment provider webhooks.
 * All webhooks are idempotent and signature-verified.
 */

import { Router, Request, Response } from 'express';
import { getPaymentService } from '../payment.service';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import type { PaymentProvider } from '@prisma/client';

// ==================================================
// ROUTER
// ==================================================

export const webhookRouter = Router();

/**
 * CinetPay Webhook
 * POST /webhooks/cinetpay
 */
webhookRouter.post('/cinetpay', async (req: Request, res: Response) => {
    await handleWebhook(req, res, 'CINETPAY');
});

/**
 * Stripe Webhook
 * POST /webhooks/stripe
 */
webhookRouter.post('/stripe', async (req: Request, res: Response) => {
    await handleWebhook(req, res, 'STRIPE');
});

/**
 * NotchPay Webhook (placeholder)
 * POST /webhooks/notchpay
 */
webhookRouter.post('/notchpay', async (req: Request, res: Response) => {
    await handleWebhook(req, res, 'NOTCHPAY');
});

// ==================================================
// HANDLER
// ==================================================

/**
 * Generic webhook handler.
 * 
 * Rules:
 * - Always return 200 (to prevent retries for valid requests)
 * - Log everything for audit
 * - No business logic here, delegate to PaymentService
 */
async function handleWebhook(
    req: Request,
    res: Response,
    provider: PaymentProvider
): Promise<void> {
    const startTime = Date.now();

    try {
        // Get raw body (must be preserved for signature verification)
        const rawBody = typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body);

        // Extract headers for signature
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') {
                headers[key.toLowerCase()] = value;
            }
        }

        // Process webhook
        const paymentService = getPaymentService(prisma);
        const result = await paymentService.handleWebhook({
            provider,
            rawBody,
            signature: headers['stripe-signature'] ?? headers['x-cinetpay-signature'] ?? '',
            headers,
        });

        // Log result
        logger.info({
            provider,
            success: result.success,
            paymentId: result.paymentId,
            newStatus: result.newStatus,
            durationMs: Date.now() - startTime,
        }, 'Webhook processed');

        // Always return 200 for valid requests
        // (invalid signature returns 400 below)
        if (result.success) {
            res.status(200).json({
                received: true,
                paymentId: result.paymentId,
            });
        } else if (result.error === 'Invalid signature') {
            res.status(400).json({ error: 'Invalid signature' });
        } else {
            // Other errors (payment not found, etc.) - still return 200
            // to prevent provider retries
            res.status(200).json({
                received: true,
                warning: result.error,
            });
        }

    } catch (error) {
        logger.error({ error, provider }, 'Webhook handler error');

        // Return 500 for unexpected errors
        // This will trigger provider retry
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ==================================================
// RAW BODY MIDDLEWARE
// ==================================================

/**
 * Middleware to preserve raw body for signature verification.
 * Must be applied before JSON parsing.
 */
export function rawBodyMiddleware(
    req: Request,
    res: Response,
    buf: Buffer
): void {
    (req as Request & { rawBody: Buffer }).rawBody = buf;
}
