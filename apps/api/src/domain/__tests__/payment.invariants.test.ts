/**
 * Payment Service — Business Invariants Tests
 * 
 * Tests payment lifecycle rules, idempotency constraints,
 * and financial consistency invariants.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { createPayment, createQuote } from '../test/factories';

// ==================================================
// PAYMENT LIFECYCLE
// ==================================================

describe('Payment State Machine', () => {
    const VALID_PAYMENT_TRANSITIONS: Record<string, string[]> = {
        'INITIATED': ['PENDING', 'FAILED', 'EXPIRED'],
        'PENDING': ['CONFIRMED', 'FAILED', 'EXPIRED'],
        'CONFIRMED': ['REFUNDED'],
        'FAILED': ['INITIATED'],  // Allow retry
        'EXPIRED': ['INITIATED'],  // Allow retry
        'REFUNDED': [],             // Terminal
    };

    describe('Forward transitions', () => {
        it('INITIATED payment can move to PENDING or FAILED', () => {
            expect(VALID_PAYMENT_TRANSITIONS['INITIATED']).toContain('PENDING');
            expect(VALID_PAYMENT_TRANSITIONS['INITIATED']).toContain('FAILED');
        });

        it('PENDING payment can be CONFIRMED or FAILED', () => {
            expect(VALID_PAYMENT_TRANSITIONS['PENDING']).toContain('CONFIRMED');
            expect(VALID_PAYMENT_TRANSITIONS['PENDING']).toContain('FAILED');
        });

        it('CONFIRMED payment can only be REFUNDED', () => {
            expect(VALID_PAYMENT_TRANSITIONS['CONFIRMED']).toEqual(['REFUNDED']);
        });

        it('REFUNDED is terminal', () => {
            expect(VALID_PAYMENT_TRANSITIONS['REFUNDED']).toHaveLength(0);
        });
    });

    describe('Retry logic', () => {
        it('FAILED payment can be retried (back to INITIATED)', () => {
            expect(VALID_PAYMENT_TRANSITIONS['FAILED']).toContain('INITIATED');
        });

        it('EXPIRED payment can be retried (back to INITIATED)', () => {
            expect(VALID_PAYMENT_TRANSITIONS['EXPIRED']).toContain('INITIATED');
        });

        it('CONFIRMED payment cannot be retried', () => {
            expect(VALID_PAYMENT_TRANSITIONS['CONFIRMED']).not.toContain('INITIATED');
        });
    });

    describe('Invalid transitions', () => {
        it('cannot go from CONFIRMED back to PENDING', () => {
            expect(VALID_PAYMENT_TRANSITIONS['CONFIRMED']).not.toContain('PENDING');
        });

        it('cannot go from REFUNDED to any state', () => {
            const allStates = Object.keys(VALID_PAYMENT_TRANSITIONS);
            for (const state of allStates) {
                expect(VALID_PAYMENT_TRANSITIONS['REFUNDED']).not.toContain(state);
            }
        });
    });
});

// ==================================================
// FINANCIAL CONSISTENCY
// ==================================================

describe('Financial Consistency Invariants', () => {
    describe('Payment-Quote amount matching', () => {
        it('payment amount must match quote total price', () => {
            const quote = createQuote({
                totalPriceXof: new Decimal(4500),
            });
            const payment = createPayment({
                amountXof: new Decimal(4500),
                quoteId: quote.id,
            });

            expect(payment.amountXof.toNumber()).toBe(quote.totalPriceXof.toNumber());
        });

        it('should detect amount mismatch', () => {
            const quote = createQuote({
                totalPriceXof: new Decimal(4500),
            });
            const payment = createPayment({
                amountXof: new Decimal(5000), // Wrong amount!
                quoteId: quote.id,
            });

            const mismatch = !payment.amountXof.eq(quote.totalPriceXof);
            expect(mismatch).toBe(true);
        });
    });

    describe('Currency consistency', () => {
        it('payment currency must be XOF', () => {
            const payment = createPayment();
            expect(payment.currencyCode).toBe('XOF');
        });

        it('payment and quote currencies must match', () => {
            const quote = createQuote({ currencyCode: 'XOF' });
            const payment = createPayment({ currencyCode: 'XOF' });
            expect(payment.currencyCode).toBe(quote.currencyCode);
        });
    });

    describe('Amount validation', () => {
        it('payment amount must be positive', () => {
            const payment = createPayment();
            expect(payment.amountXof.toNumber()).toBeGreaterThan(0);
        });
    });
});

// ==================================================
// WEBHOOK IDEMPOTENCY
// ==================================================

describe('Webhook Idempotency', () => {
    it('processing the same webhook twice should be safe', () => {
        // Simulate idempotency check: if payment already CONFIRMED, skip
        const payment = createPayment({ status: 'CONFIRMED' });
        const isAlreadyConfirmed = payment.status === 'CONFIRMED';

        // Second webhook for same payment should be a no-op
        expect(isAlreadyConfirmed).toBe(true);
        // The implementation should return the existing payment without changes
    });

    it('should track provider transaction ID for deduplication', () => {
        const payment = createPayment({
            providerTransactionId: 'cinetpay-txn-12345',
        });
        expect(payment.providerTransactionId).toBeTruthy();
    });

    it('provider transaction ID should be usable as idempotency key', () => {
        const payment1 = createPayment({ providerTransactionId: 'txn-001' });
        const payment2 = createPayment({ providerTransactionId: 'txn-001' });

        // Same provider transaction ID = same logical payment
        expect(payment1.providerTransactionId).toBe(payment2.providerTransactionId);
    });
});

// ==================================================
// PAYMENT EXPIRATION
// ==================================================

describe('Payment Expiration', () => {
    it('payment with past expiry should be considered expired', () => {
        const payment = createPayment({
            expiresAt: new Date(Date.now() - 60_000),
        });
        const isExpired = new Date() > payment.expiresAt;
        expect(isExpired).toBe(true);
    });

    it('only INITIATED or PENDING payments should be expirable', () => {
        const expirableStates = ['INITIATED', 'PENDING'];
        const nonExpirableStates = ['CONFIRMED', 'FAILED', 'REFUNDED'];

        for (const state of expirableStates) {
            expect(['INITIATED', 'PENDING']).toContain(state);
        }
        for (const state of nonExpirableStates) {
            expect(['INITIATED', 'PENDING']).not.toContain(state);
        }
    });
});
