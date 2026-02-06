/**
 * Financial Ledger Service
 * 
 * Provides immutable financial record-keeping for payment traceability.
 * 
 * Key principles:
 * - Entries are append-only (no UPDATE, no DELETE)
 * - Corrections via compensating entries only
 * - All entries link to payment, quote, and pricing rule version
 */

import { PrismaClient, LedgerEntryType, Prisma } from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// TYPES
// ==================================================

export interface ReconciliationReportItem {
    providerName: string;
    currencyCode: string;
    totalCredits: number;
    totalDebits: number;
    netAmount: number;
    entryCount: number;
}

export interface ReconciliationReport {
    startDate: Date;
    endDate: Date;
    items: ReconciliationReportItem[];
    grandTotal: {
        credits: number;
        debits: number;
        net: number;
    };
}

export interface LedgerEntryWithPayment {
    id: string;
    entryType: LedgerEntryType;
    amountXof: Prisma.Decimal;
    currencyCode: string;
    paymentId: string;
    quoteId: string | null;
    shipmentId: string;
    pricingRuleId: string | null;
    pricingRuleVersion: number | null;
    scanResultId: string | null;
    providerReference: string | null;
    providerName: string | null;
    compensatesEntryId: string | null;
    compensationReason: string | null;
    createdAt: Date;
}

// ==================================================
// SERVICE
// ==================================================

export class LedgerService {
    private readonly prisma: PrismaClient;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    // ==================================================
    // RECORD CONFIRMED PAYMENT
    // ==================================================

    /**
     * Record a confirmed payment in the financial ledger.
     * 
     * This creates an immutable CREDIT entry with full audit trail:
     * - Links to payment, quote, pricing rule, scan result
     * - Captures pricing rule version at time of payment
     * - Records provider reference for reconciliation
     * 
     * Idempotent: if entry already exists for this payment, returns existing.
     */
    async recordConfirmedPayment(paymentId: string): Promise<LedgerEntryWithPayment> {
        // Check if entry already exists (idempotency)
        const existing = await this.prisma.financialLedgerEntry.findFirst({
            where: {
                paymentId,
                entryType: 'CREDIT',
            },
        });

        if (existing) {
            logger.info({ paymentId, entryId: existing.id }, 'Ledger entry already exists, skipping');
            return existing;
        }

        // Fetch payment with related data
        const payment = await this.prisma.payment.findUniqueOrThrow({
            where: { id: paymentId },
            include: {
                shipment: {
                    include: {
                        quote: {
                            include: {
                                pricingRule: true,
                            },
                        },
                        scanResult: true,
                    },
                },
            },
        });

        if (payment.status !== 'CONFIRMED') {
            throw new LedgerError(
                'INVALID_PAYMENT_STATUS',
                `Cannot record ledger entry for payment with status ${payment.status}`
            );
        }

        // Extract references
        const quote = payment.shipment?.quote;
        const pricingRule = quote?.pricingRule;
        const scanResult = payment.shipment?.scanResult;

        // Create immutable ledger entry
        const entry = await this.prisma.financialLedgerEntry.create({
            data: {
                entryType: 'CREDIT',
                amountXof: payment.amountXof,
                currencyCode: payment.currencyCode,
                paymentId: payment.id,
                quoteId: payment.quoteId,
                shipmentId: payment.shipmentId,
                pricingRuleId: pricingRule?.id ?? null,
                pricingRuleVersion: pricingRule?.version ?? null,
                scanResultId: scanResult?.id ?? null,
                providerReference: payment.gatewayReference,
                providerName: payment.provider,
            },
        });

        logger.info({
            entryId: entry.id,
            paymentId,
            amount: Number(payment.amountXof),
            provider: payment.provider,
        }, 'Financial ledger entry created');

        return entry;
    }

    // ==================================================
    // COMPENSATING ENTRY
    // ==================================================

    /**
     * Create a compensating (DEBIT) entry for a refund or correction.
     * 
     * Rules:
     * - Links to original entry being compensated
     * - Cannot compensate an already compensated entry
     * - Amount must match original entry
     */
    async recordCompensatingEntry(
        originalEntryId: string,
        reason: string
    ): Promise<LedgerEntryWithPayment> {
        // Fetch original entry
        const originalEntry = await this.prisma.financialLedgerEntry.findUniqueOrThrow({
            where: { id: originalEntryId },
        });

        if (originalEntry.entryType !== 'CREDIT') {
            throw new LedgerError(
                'INVALID_ENTRY_TYPE',
                'Can only compensate CREDIT entries'
            );
        }

        // Check if already compensated
        const existingCompensation = await this.prisma.financialLedgerEntry.findFirst({
            where: {
                compensatesEntryId: originalEntryId,
            },
        });

        if (existingCompensation) {
            throw new LedgerError(
                'ALREADY_COMPENSATED',
                `Entry ${originalEntryId} was already compensated by ${existingCompensation.id}`
            );
        }

        // Create compensating DEBIT entry
        const entry = await this.prisma.financialLedgerEntry.create({
            data: {
                entryType: 'DEBIT',
                amountXof: originalEntry.amountXof,
                currencyCode: originalEntry.currencyCode,
                paymentId: originalEntry.paymentId,
                quoteId: originalEntry.quoteId,
                shipmentId: originalEntry.shipmentId,
                pricingRuleId: originalEntry.pricingRuleId,
                pricingRuleVersion: originalEntry.pricingRuleVersion,
                scanResultId: originalEntry.scanResultId,
                providerReference: originalEntry.providerReference,
                providerName: originalEntry.providerName,
                compensatesEntryId: originalEntryId,
                compensationReason: reason,
            },
        });

        logger.info({
            entryId: entry.id,
            compensatesEntryId: originalEntryId,
            amount: Number(originalEntry.amountXof),
            reason,
        }, 'Compensating ledger entry created');

        return entry;
    }

    // ==================================================
    // QUERIES
    // ==================================================

    /**
     * Get all ledger entries for a shipment.
     */
    async getLedgerByShipment(shipmentId: string): Promise<LedgerEntryWithPayment[]> {
        return this.prisma.financialLedgerEntry.findMany({
            where: { shipmentId },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Get ledger entry by ID.
     */
    async getEntry(entryId: string): Promise<LedgerEntryWithPayment | null> {
        return this.prisma.financialLedgerEntry.findUnique({
            where: { id: entryId },
        });
    }

    /**
     * Get all entries for a payment.
     */
    async getLedgerByPayment(paymentId: string): Promise<LedgerEntryWithPayment[]> {
        return this.prisma.financialLedgerEntry.findMany({
            where: { paymentId },
            orderBy: { createdAt: 'asc' },
        });
    }

    // ==================================================
    // RECONCILIATION
    // ==================================================

    /**
     * Generate a basic reconciliation report.
     * 
     * Groups entries by provider and currency, calculates totals.
     */
    async getReconciliationReport(
        startDate: Date,
        endDate: Date
    ): Promise<ReconciliationReport> {
        const entries = await this.prisma.financialLedgerEntry.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
        });

        // Group by provider + currency
        const groups = new Map<string, {
            credits: number;
            debits: number;
            count: number;
        }>();

        let totalCredits = 0;
        let totalDebits = 0;

        for (const entry of entries) {
            const key = `${entry.providerName ?? 'UNKNOWN'}|${entry.currencyCode}`;
            const amount = Number(entry.amountXof);

            if (!groups.has(key)) {
                groups.set(key, { credits: 0, debits: 0, count: 0 });
            }

            const group = groups.get(key)!;
            group.count++;

            if (entry.entryType === 'CREDIT') {
                group.credits += amount;
                totalCredits += amount;
            } else {
                group.debits += amount;
                totalDebits += amount;
            }
        }

        // Build report items
        const items: ReconciliationReportItem[] = [];
        for (const [key, data] of groups.entries()) {
            const parts = key.split('|');
            const providerName = parts[0] ?? 'UNKNOWN';
            const currencyCode = parts[1] ?? 'XOF';
            items.push({
                providerName,
                currencyCode,
                totalCredits: data.credits,
                totalDebits: data.debits,
                netAmount: data.credits - data.debits,
                entryCount: data.count,
            });
        }

        // Sort by net amount descending
        items.sort((a, b) => b.netAmount - a.netAmount);

        return {
            startDate,
            endDate,
            items,
            grandTotal: {
                credits: totalCredits,
                debits: totalDebits,
                net: totalCredits - totalDebits,
            },
        };
    }
}

// ==================================================
// ERRORS
// ==================================================

export class LedgerError extends Error {
    constructor(
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = 'LedgerError';
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: LedgerService | null = null;

export function getLedgerService(prisma: PrismaClient): LedgerService {
    if (!instance) {
        instance = new LedgerService(prisma);
    }
    return instance;
}
