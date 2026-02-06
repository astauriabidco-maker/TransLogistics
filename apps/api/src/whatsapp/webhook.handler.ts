/**
 * Webhook Handler
 * 
 * Express router for WhatsApp Cloud API webhooks.
 * Handles verification, message intake, and idempotency.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getWhatsAppConfig } from './config';
import { SessionRepository } from './session.repository';
import { IdempotencyService } from './idempotency.service';
import { WhatsAppAuditLogger } from './audit.logger';
import { processMessage } from './message.processor';
import { logger } from '../lib/logger';
import type { PrismaClient } from '@prisma/client';
import type { WhatsAppWebhookPayload, IncomingMessage } from './types';

// ==================================================
// WEBHOOK ROUTER
// ==================================================

export function createWhatsAppRouter(prisma: PrismaClient): Router {
    const router = Router();
    const config = getWhatsAppConfig();
    const sessionRepo = new SessionRepository(prisma);
    const idempotency = new IdempotencyService(prisma);
    const auditLogger = new WhatsAppAuditLogger(prisma);

    /**
     * GET /whatsapp/webhook - Verification endpoint
     * Called by WhatsApp to verify webhook URL.
     */
    router.get('/webhook', (req: Request, res: Response) => {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === config.verifyToken) {
            logger.info('WhatsApp webhook verified');
            res.status(200).send(challenge);
        } else {
            logger.warn('WhatsApp webhook verification failed', { mode, token });
            res.sendStatus(403);
        }
    });

    /**
     * POST /whatsapp/webhook - Message intake
     * Called by WhatsApp for every incoming message.
     */
    router.post('/webhook', async (req: Request, res: Response) => {
        // Validate signature
        if (!validateSignature(req, config.webhookSecret)) {
            logger.warn('Invalid WhatsApp webhook signature');
            res.sendStatus(401);
            return;
        }

        // Always respond 200 quickly to acknowledge receipt
        res.sendStatus(200);

        // Process asynchronously
        try {
            await handleWebhookPayload(
                req.body,
                sessionRepo,
                idempotency,
                auditLogger
            );
        } catch (error) {
            logger.error('WhatsApp webhook processing error', { error });
        }
    });

    return router;
}

// ==================================================
// SIGNATURE VALIDATION
// ==================================================

function validateSignature(req: Request, secret: string): boolean {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) return false;

    const expectedSignature = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('hex')}`;

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

// ==================================================
// PAYLOAD PROCESSING
// ==================================================

async function handleWebhookPayload(
    payload: WhatsAppWebhookPayload,
    sessionRepo: SessionRepository,
    idempotency: IdempotencyService,
    auditLogger: WhatsAppAuditLogger
): Promise<void> {
    // Only process whatsapp_business_account events
    if (payload.object !== 'whatsapp_business_account') {
        return;
    }

    for (const entry of payload.entry) {
        for (const change of entry.changes) {
            if (change.field !== 'messages') continue;

            const value = change.value;
            const messages = value.messages ?? [];
            const contacts = value.contacts ?? [];

            for (const message of messages) {
                await handleMessage(
                    message,
                    contacts,
                    sessionRepo,
                    idempotency,
                    auditLogger
                );
            }
        }
    }
}

async function handleMessage(
    message: IncomingMessage,
    contacts: Array<{ profile: { name: string }; wa_id: string }>,
    sessionRepo: SessionRepository,
    idempotency: IdempotencyService,
    auditLogger: WhatsAppAuditLogger
): Promise<void> {
    const messageId = message.id;
    const phoneNumber = message.from;
    const startTime = Date.now();

    // Idempotency check (database-backed, survives restart)
    if (await idempotency.isProcessed(messageId)) {
        logger.debug('Duplicate message ignored', { messageId });
        return;
    }
    await idempotency.markProcessed(messageId);

    // Get contact name
    const contact = contacts.find((c) => c.wa_id === phoneNumber);
    const userName = contact?.profile?.name;

    // Get or create session
    const session = await sessionRepo.getOrCreateSession(phoneNumber);

    // Log incoming message
    logger.info('WhatsApp message received', {
        messageId,
        phoneNumber,
        type: message.type,
        state: session.state,
    });

    let errorMessage: string | undefined;

    try {
        // Process message through state machine
        await processMessage({
            session,
            message,
            phoneNumber,
            userName,
        }, sessionRepo);
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Message processing failed', { error, messageId });
    }

    // Audit log (async, non-blocking)
    const processingTimeMs = Date.now() - startTime;
    auditLogger.logInbound(
        message,
        phoneNumber,
        session.state,
        processingTimeMs,
        errorMessage
    ).catch(() => { /* ignore audit failures */ });
}

