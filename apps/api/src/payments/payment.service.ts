/**
 * Payment Service
 * 
 * Core payment orchestration service.
 * Handles payment creation, status updates, and webhook processing.
 */

import { PrismaClient, PaymentStatus, PaymentMethod, PaymentProvider } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../lib/logger';
import { LedgerService, getLedgerService } from '../ledger';
import {
    InitiatePaymentInput,
    PaymentResult,
    WebhookPayload,
    WebhookResult,
    PaymentAdapter,
    canTransition,
    PAYMENT_LINK_EXPIRY_HOURS,
} from './payment.types';

// ==================================================
// SERVICE
// ==================================================

export class PaymentService {
    private readonly prisma: PrismaClient;
    private readonly adapters: Map<PaymentProvider, PaymentAdapter>;
    private readonly ledgerService: LedgerService;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.adapters = new Map();
        this.ledgerService = getLedgerService(prisma);
    }

    /**
     * Register a payment adapter for a provider.
     */
    registerAdapter(adapter: PaymentAdapter): void {
        this.adapters.set(adapter.provider, adapter);
        logger.info(`Payment adapter registered for ${adapter.provider}`);
    }

    /**
     * Get adapter for a provider.
     */
    private getAdapter(provider: PaymentProvider): PaymentAdapter {
        const adapter = this.adapters.get(provider);
        if (!adapter) {
            throw new Error(`No adapter registered for provider: ${provider}`);
        }
        return adapter;
    }

    // ==================================================
    // PAYMENT CREATION
    // ==================================================

    /**
     * Initiate a new payment.
     * 
     * Rules:
     * - Amount is locked at creation (from quote)
     * - One payment per shipment
     * - Idempotency key ensures no duplicates
     * - Uses serializable transaction to prevent race conditions
     */
    async initiatePayment(input: InitiatePaymentInput): Promise<PaymentResult> {
        const {
            shipmentId,
            quoteId,
            amountXof,
            currencyCode = 'XOF',
            method,
            provider,
            returnUrl = process.env['PAYMENT_RETURN_URL'] ?? 'https://translogistics.app/payment/success',
            cancelUrl = process.env['PAYMENT_CANCEL_URL'] ?? 'https://translogistics.app/payment/cancel',
        } = input;

        // Generate idempotency key
        const idempotencyKey = `pay_${shipmentId}_${Date.now()}`;

        // Calculate expiry
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + PAYMENT_LINK_EXPIRY_HOURS);

        // Use serializable transaction to prevent race conditions on double-payment check
        const payment = await this.prisma.$transaction(async (tx) => {
            // Check for existing payment on this shipment (inside transaction)
            const existingPayment = await tx.payment.findUnique({
                where: { shipmentId },
            });

            if (existingPayment) {
                // If already paid, reject
                if (existingPayment.status === 'CONFIRMED') {
                    throw new PaymentError('ALREADY_PAID', 'This shipment has already been paid');
                }

                // If pending/initiated, return existing (no new payment needed)
                if (['INITIATED', 'PENDING', 'PROCESSING'].includes(existingPayment.status)) {
                    return existingPayment;
                }

                // If failed/expired, delete old one first
                await tx.payment.delete({ where: { id: existingPayment.id } });
            }

            // Create payment record (inside same transaction)
            return tx.payment.create({
                data: {
                    shipmentId,
                    quoteId,
                    amountXof,
                    currencyCode,
                    method,
                    provider,
                    status: 'INITIATED',
                    idempotencyKey,
                    expiresAt,
                    initiatedAt: new Date(),
                },
            });
        }, {
            isolationLevel: 'Serializable', // Prevent concurrent creation
            timeout: 10000, // 10 second timeout
        });

        // If we got an existing payment (pending/initiated), return it
        if (payment.status !== 'INITIATED' || payment.idempotencyKey !== idempotencyKey) {
            logger.info(`Returning existing payment ${payment.id} for shipment ${shipmentId}`);
            return {
                payment,
                paymentUrl: payment.paymentUrl,
                expiresAt: payment.expiresAt,
            };
        }

        // Log event
        await this.logEvent(payment.id, 'initiated', { input }, 'api');

        // Get payment link from provider
        let paymentUrl: string | null = null;
        try {
            const adapter = this.getAdapter(provider);
            const response = await adapter.initiate({
                paymentId: payment.id,
                amount: Number(amountXof),
                currency: currencyCode,
                description: `TransLogistics - Paiement expédition`,
                returnUrl,
                cancelUrl,
                metadata: {
                    shipmentId,
                    quoteId,
                    paymentId: payment.id,
                },
            });

            if (response.success) {
                paymentUrl = response.paymentUrl;

                // Update payment with provider info
                await this.prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        paymentUrl: response.paymentUrl,
                        gatewayReference: response.providerPaymentId,
                        expiresAt: response.expiresAt ?? expiresAt,
                    },
                });

                await this.logEvent(payment.id, 'link_generated', { response }, 'api');
            } else {
                throw new Error(response.error ?? 'Failed to initiate payment with provider');
            }
        } catch (error) {
            logger.error({ error, paymentId: payment.id }, 'Failed to get payment link');

            // Mark as failed
            await this.updateStatus(payment.id, 'FAILED', {
                failureReason: error instanceof Error ? error.message : 'Unknown error',
            });

            throw new PaymentError('PROVIDER_ERROR', 'Failed to create payment link');
        }

        // Fetch updated payment
        const updatedPayment = await this.prisma.payment.findUniqueOrThrow({
            where: { id: payment.id },
        });

        logger.info({ paymentId: payment.id, shipmentId }, 'Payment initiated');

        return {
            payment: updatedPayment,
            paymentUrl,
            expiresAt: updatedPayment.expiresAt,
        };
    }

    // ==================================================
    // PAYMENT STATUS
    // ==================================================

    /**
     * Get payment by ID.
     */
    async getPayment(paymentId: string) {
        return this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: { events: { orderBy: { createdAt: 'desc' }, take: 10 } },
        });
    }

    /**
     * Get payment by shipment ID.
     */
    async getPaymentByShipment(shipmentId: string) {
        return this.prisma.payment.findUnique({
            where: { shipmentId },
            include: { events: { orderBy: { createdAt: 'desc' }, take: 10 } },
        });
    }

    /**
     * Update payment status with transition validation.
     */
    private async updateStatus(
        paymentId: string,
        newStatus: PaymentStatus,
        additionalData: Record<string, unknown> = {}
    ): Promise<void> {
        const payment = await this.prisma.payment.findUniqueOrThrow({
            where: { id: paymentId },
        });

        // Validate transition
        if (!canTransition(payment.status, newStatus)) {
            throw new PaymentError(
                'INVALID_TRANSITION',
                `Cannot transition from ${payment.status} to ${newStatus}`
            );
        }

        // Build update data
        const updateData: Record<string, unknown> = {
            status: newStatus,
            ...additionalData,
        };

        // Set timestamp based on status
        if (newStatus === 'PROCESSING') {
            updateData['processingAt'] = new Date();
        } else if (newStatus === 'CONFIRMED') {
            updateData['confirmedAt'] = new Date();
        } else if (newStatus === 'FAILED') {
            updateData['failedAt'] = new Date();
        } else if (newStatus === 'REFUNDED') {
            updateData['refundedAt'] = new Date();
        }

        await this.prisma.payment.update({
            where: { id: paymentId },
            data: updateData,
        });

        // For CONFIRMED: ledger and shipment must succeed, otherwise payment stays PENDING
        if (newStatus === 'CONFIRMED') {
            // Record in financial ledger (REQUIRED - fail if this fails)
            await this.ledgerService.recordConfirmedPayment(paymentId);
            logger.info({ paymentId }, 'Financial ledger entry created for confirmed payment');

            // Transition shipment to CREATED (REQUIRED - fail if this fails)
            const { getShipmentService } = await import('../shipment/shipment.service');
            const shipmentService = getShipmentService(this.prisma);
            await shipmentService.createFromPayment(paymentId);
            logger.info({ paymentId }, 'Shipment transitioned to CREATED status');
        }

        await this.logEvent(paymentId, `status_${newStatus.toLowerCase()}`, { from: payment.status, to: newStatus }, 'api');
    }

    // ==================================================
    // WEBHOOK HANDLING
    // ==================================================

    /**
     * Handle webhook from payment provider.
     * 
     * Rules:
     * - Idempotent (webhookCount tracked)
     * - Signature verified by adapter
     * - No business logic, only status update
     */
    async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
        const { provider, rawBody, signature } = payload;

        logger.info({ provider }, 'Webhook received');

        try {
            // Get adapter
            const adapter = this.getAdapter(provider);

            // Verify signature and parse
            const verification = await adapter.verifyWebhook(payload);

            if (!verification.valid) {
                logger.warn({ provider, error: verification.error }, 'Webhook signature invalid');
                return {
                    success: false,
                    paymentId: null,
                    newStatus: null,
                    error: 'Invalid signature',
                };
            }

            // Find payment
            const payment = verification.paymentId
                ? await this.prisma.payment.findUnique({ where: { id: verification.paymentId } })
                : verification.providerPaymentId
                    ? await this.prisma.payment.findFirst({ where: { gatewayReference: verification.providerPaymentId } })
                    : null;

            if (!payment) {
                logger.warn({ verification }, 'Payment not found for webhook');
                return {
                    success: false,
                    paymentId: null,
                    newStatus: null,
                    error: 'Payment not found',
                };
            }

            // Log webhook event
            await this.logEvent(payment.id, 'webhook_received', {
                provider,
                rawData: verification.rawData,
                status: verification.status,
            }, 'webhook');

            // Update webhook count
            await this.prisma.payment.update({
                where: { id: payment.id },
                data: {
                    lastWebhookAt: new Date(),
                    webhookCount: { increment: 1 },
                    gatewayResponse: verification.rawData as object,
                },
            });

            // Determine new status
            let newStatus: PaymentStatus;
            switch (verification.status) {
                case 'success':
                    newStatus = 'CONFIRMED';
                    break;
                case 'failed':
                    newStatus = 'FAILED';
                    break;
                case 'pending':
                    newStatus = 'PENDING';
                    break;
                case 'expired':
                    newStatus = 'EXPIRED';
                    break;
                default:
                    newStatus = payment.status;
            }

            // Update status if changed
            if (newStatus !== payment.status && canTransition(payment.status, newStatus)) {
                await this.updateStatus(payment.id, newStatus, {
                    failureReason: verification.status === 'failed' ? 'Payment failed at provider' : undefined,
                });

                logger.info({ paymentId: payment.id, from: payment.status, to: newStatus }, 'Payment status updated via webhook');
            }

            return {
                success: true,
                paymentId: payment.id,
                newStatus,
            };

        } catch (error) {
            logger.error({ error, provider }, 'Webhook processing error');
            return {
                success: false,
                paymentId: null,
                newStatus: null,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    // ==================================================
    // EXPIRY MANAGEMENT
    // ==================================================

    /**
     * Expire stale payments.
     * Should be called by cron job.
     */
    async expireStalePayments(): Promise<number> {
        const now = new Date();

        const stalePayments = await this.prisma.payment.findMany({
            where: {
                status: { in: ['INITIATED', 'PENDING'] },
                expiresAt: { lt: now },
            },
        });

        let count = 0;
        for (const payment of stalePayments) {
            try {
                await this.prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'EXPIRED' },
                });
                await this.logEvent(payment.id, 'expired', { expiresAt: payment.expiresAt }, 'cron');
                count++;
            } catch (error) {
                logger.error({ error, paymentId: payment.id }, 'Failed to expire payment');
            }
        }

        if (count > 0) {
            logger.info({ count }, 'Expired stale payments');
        }

        return count;
    }

    // ==================================================
    // AUDIT
    // ==================================================

    /**
     * Log a payment event.
     */
    private async logEvent(
        paymentId: string,
        eventType: string,
        eventData: Record<string, unknown>,
        source: string
    ): Promise<void> {
        await this.prisma.paymentEvent.create({
            data: {
                paymentId,
                eventType,
                eventData: eventData as object,
                source,
            },
        });
    }
}

// ==================================================
// ERRORS
// ==================================================

export class PaymentError extends Error {
    constructor(
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = 'PaymentError';
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: PaymentService | null = null;

export function getPaymentService(prisma: PrismaClient): PaymentService {
    if (!instance) {
        instance = new PaymentService(prisma);
    }
    return instance;
}
