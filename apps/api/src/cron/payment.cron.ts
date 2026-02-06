/**
 * Payment Cron Jobs
 * 
 * Scheduled tasks for payment maintenance:
 * - Expire stale payments (every hour)
 * - Detect and recover orphan payments (every 15 minutes)
 */

import { CronJob } from 'cron';
import { getPaymentService } from '../payments';
import { getLedgerService } from '../ledger/ledger.service';
import { getShipmentService } from '../shipment/shipment.service';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// ==================================================
// CRON JOBS
// ==================================================

let expirePaymentsCron: CronJob | null = null;
let orphanRecoveryCron: CronJob | null = null;

/**
 * Start all payment cron jobs.
 */
export function startPaymentCron(): void {
    // Expire stale payments every hour at minute 0
    expirePaymentsCron = new CronJob(
        '0 * * * *', // Every hour at :00
        async () => {
            logger.info('Running payment expiry cron...');

            try {
                const paymentService = getPaymentService(prisma);
                const count = await paymentService.expireStalePayments();

                if (count > 0) {
                    logger.info({ count }, 'Expired stale payments');
                }
            } catch (error) {
                logger.error({ error }, 'Payment expiry cron failed');
            }
        },
        null, // onComplete
        true, // start immediately
        'Africa/Abidjan' // Timezone (UTC+0, common for West Africa)
    );

    // Orphan recovery every 15 minutes
    orphanRecoveryCron = new CronJob(
        '*/15 * * * *', // Every 15 minutes
        async () => {
            logger.info('Running orphan recovery cron...');

            try {
                const result = await recoverOrphanPayments();
                if (result.ledgerFixed > 0 || result.shipmentFixed > 0) {
                    logger.info(result, 'Orphan payments recovered');
                }
            } catch (error) {
                logger.error({ error }, 'Orphan recovery cron failed');
            }
        },
        null,
        true,
        'Africa/Abidjan'
    );

    logger.info('Payment cron jobs started');
}

/**
 * Stop all payment cron jobs.
 */
export function stopPaymentCron(): void {
    if (expirePaymentsCron) {
        expirePaymentsCron.stop();
        expirePaymentsCron = null;
    }

    if (orphanRecoveryCron) {
        orphanRecoveryCron.stop();
        orphanRecoveryCron = null;
    }

    logger.info('Payment cron jobs stopped');
}

/**
 * Run payment expiry manually (for testing).
 */
export async function runPaymentExpiryNow(): Promise<number> {
    const paymentService = getPaymentService(prisma);
    return paymentService.expireStalePayments();
}

// ==================================================
// ORPHAN RECOVERY
// ==================================================

interface OrphanRecoveryResult {
    orphansFound: number;
    ledgerFixed: number;
    shipmentFixed: number;
    errors: string[];
}

/**
 * Detect and recover orphan payments.
 * 
 * Orphan = CONFIRMED payment that:
 * - Has no ledger entry, OR
 * - Has a DRAFT shipment (not activated)
 */
export async function recoverOrphanPayments(): Promise<OrphanRecoveryResult> {
    const result: OrphanRecoveryResult = {
        orphansFound: 0,
        ledgerFixed: 0,
        shipmentFixed: 0,
        errors: [],
    };

    // Find all CONFIRMED payments
    const confirmedPayments = await prisma.payment.findMany({
        where: { status: 'CONFIRMED' },
        include: {
            shipment: true,
        },
    });

    const ledgerService = getLedgerService(prisma);
    const shipmentService = getShipmentService(prisma);

    for (const payment of confirmedPayments) {
        let isOrphan = false;

        // Check 1: Does it have a ledger entry?
        const ledgerEntries = await prisma.financialLedgerEntry.findMany({
            where: { paymentId: payment.id },
        });

        if (ledgerEntries.length === 0) {
            isOrphan = true;
            result.orphansFound++;

            try {
                await ledgerService.recordConfirmedPayment(payment.id);
                result.ledgerFixed++;
                logger.info({ paymentId: payment.id }, 'Orphan: created missing ledger entry');
            } catch (error) {
                const errMsg = `Failed to create ledger for ${payment.id}: ${error instanceof Error ? error.message : 'unknown'}`;
                result.errors.push(errMsg);
                logger.error({ error, paymentId: payment.id }, errMsg);
            }
        }

        // Check 2: Is the shipment still in DRAFT?
        if (payment.shipment && payment.shipment.status === 'DRAFT') {
            isOrphan = true;
            if (ledgerEntries.length > 0) {
                result.orphansFound++; // Only count if not already counted above
            }

            try {
                await shipmentService.createFromPayment(payment.id);
                result.shipmentFixed++;
                logger.info({ paymentId: payment.id, shipmentId: payment.shipment.id }, 'Orphan: activated DRAFT shipment');
            } catch (error) {
                const errMsg = `Failed to activate shipment for ${payment.id}: ${error instanceof Error ? error.message : 'unknown'}`;
                result.errors.push(errMsg);
                logger.error({ error, paymentId: payment.id }, errMsg);
            }
        }
    }

    return result;
}

/**
 * Get orphan count for admin monitoring.
 */
export async function getOrphanCount(): Promise<{ ledgerMissing: number; shipmentDraft: number }> {
    // CONFIRMED payments without ledger entry
    const paymentsWithoutLedger = await prisma.payment.findMany({
        where: {
            status: 'CONFIRMED',
            NOT: {
                id: {
                    in: (await prisma.financialLedgerEntry.findMany({ select: { paymentId: true } })).map(e => e.paymentId),
                },
            },
        },
    });

    // CONFIRMED payments with DRAFT shipments
    const paymentsWithDraftShipment = await prisma.payment.findMany({
        where: {
            status: 'CONFIRMED',
            shipment: {
                status: 'DRAFT',
            },
        },
    });

    return {
        ledgerMissing: paymentsWithoutLedger.length,
        shipmentDraft: paymentsWithDraftShipment.length,
    };
}

