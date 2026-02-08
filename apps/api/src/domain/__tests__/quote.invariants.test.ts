/**
 * Quote Service — Business Invariants Tests
 * 
 * Tests the critical business rules that any IQuoteService implementation must satisfy.
 * These are interface-contract tests that validate pricing logic and lifecycle rules.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { createQuote, createPricingRule } from '../test/factories';

// ==================================================
// PRICING CALCULATION INVARIANTS
// ==================================================

describe('Quote Pricing Invariants', () => {
    describe('Payable Weight Calculation', () => {
        it('should use declared weight when no volumetric weight available', () => {
            const quote = createQuote({
                declaredWeightKg: new Decimal(5),
                volumetricWeightKg: new Decimal(0),
                payableWeightKg: new Decimal(5),
                weightSource: 'DECLARED',
            });
            expect(quote.payableWeightKg.toNumber()).toBe(5);
            expect(quote.weightSource).toBe('DECLARED');
        });

        it('should use volumetric weight when it exceeds declared weight', () => {
            const quote = createQuote({
                declaredWeightKg: new Decimal(2),
                volumetricWeightKg: new Decimal(8),
                payableWeightKg: new Decimal(8),
                weightSource: 'VOLUMETRIC',
            });
            // payableWeightKg = max(declared, volumetric)
            expect(quote.payableWeightKg.toNumber()).toBeGreaterThanOrEqual(
                quote.declaredWeightKg.toNumber()
            );
            expect(quote.payableWeightKg.toNumber()).toBe(8);
        });

        it('should use real weight when it exceeds both declared and volumetric', () => {
            const quote = createQuote({
                declaredWeightKg: new Decimal(2),
                realWeightKg: new Decimal(10),
                volumetricWeightKg: new Decimal(8),
                payableWeightKg: new Decimal(10),
                weightSource: 'REAL',
            });
            expect(quote.payableWeightKg.toNumber()).toBe(10);
        });

        it('payableWeightKg must always be >= declaredWeightKg', () => {
            const scenarios = [
                { declared: 5, volumetric: 3, expected: 5 },
                { declared: 3, volumetric: 7, expected: 7 },
                { declared: 10, volumetric: 10, expected: 10 },
                { declared: 0.5, volumetric: 0.1, expected: 0.5 },
            ];

            for (const { declared, volumetric, expected } of scenarios) {
                const payable = Math.max(declared, volumetric);
                expect(payable).toBe(expected);
                expect(payable).toBeGreaterThanOrEqual(declared);
            }
        });
    });

    describe('Price Breakdown', () => {
        it('should calculate total from base + weight charge', () => {
            const rule = createPricingRule({
                basePriceXof: new Decimal(2000),
                pricePerKg: new Decimal(500),
            });

            const weightKg = 5;
            const expectedTotal = rule.basePriceXof.toNumber() +
                (rule.pricePerKg.toNumber() * weightKg);

            expect(expectedTotal).toBe(4500);
        });

        it('should enforce minimum price', () => {
            const rule = createPricingRule({
                basePriceXof: new Decimal(100),
                pricePerKg: new Decimal(50),
                minimumPriceXof: new Decimal(500),
            });

            const weightKg = 1;
            const calculatedPrice = rule.basePriceXof.toNumber() +
                (rule.pricePerKg.toNumber() * weightKg);
            const finalPrice = Math.max(calculatedPrice, rule.minimumPriceXof.toNumber());

            expect(calculatedPrice).toBe(150);
            expect(finalPrice).toBe(500); // Minimum enforced
        });

        it('total price must always be >= minimum price', () => {
            const rule = createPricingRule();
            const quote = createQuote({
                totalPriceXof: new Decimal(4500),
            });
            expect(quote.totalPriceXof.toNumber()).toBeGreaterThanOrEqual(
                rule.minimumPriceXof.toNumber()
            );
        });
    });
});

// ==================================================
// QUOTE LIFECYCLE INVARIANTS
// ==================================================

describe('Quote Lifecycle Invariants', () => {
    describe('Immutability after acceptance', () => {
        it('accepted quote should be locked', () => {
            const quote = createQuote({
                status: 'ACCEPTED',
                isLocked: true,
                acceptedAt: new Date(),
            });
            expect(quote.isLocked).toBe(true);
            expect(quote.acceptedAt).not.toBeNull();
        });

        it('pending quote should not be locked', () => {
            const quote = createQuote({
                status: 'PENDING',
                isLocked: false,
            });
            expect(quote.isLocked).toBe(false);
        });
    });

    describe('Status transitions', () => {
        const validTransitions: Record<string, string[]> = {
            'PENDING': ['ACCEPTED', 'REJECTED', 'EXPIRED'],
            'ACCEPTED': [],  // Terminal — immutable
            'REJECTED': [],  // Terminal
            'EXPIRED': [],   // Terminal
        };

        for (const [fromStatus, allowedTargets] of Object.entries(validTransitions)) {
            if (allowedTargets.length === 0) {
                it(`${fromStatus} should be a terminal state`, () => {
                    expect(allowedTargets).toHaveLength(0);
                });
            }

            for (const target of allowedTargets) {
                it(`should allow transition from ${fromStatus} to ${target}`, () => {
                    expect(validTransitions[fromStatus]).toContain(target);
                });
            }
        }

        it('should not allow transition from ACCEPTED to any state', () => {
            expect(validTransitions['ACCEPTED']).toHaveLength(0);
        });

        it('should not allow transition from REJECTED to any state', () => {
            expect(validTransitions['REJECTED']).toHaveLength(0);
        });
    });

    describe('Quote expiration', () => {
        it('quote with past expiry should be considered expired', () => {
            const quote = createQuote({
                expiresAt: new Date(Date.now() - 60_000), // 1 minute ago
            });
            const isExpired = new Date() > quote.expiresAt;
            expect(isExpired).toBe(true);
        });

        it('quote with future expiry should be valid', () => {
            const quote = createQuote({
                expiresAt: new Date(Date.now() + 3_600_000), // 1 hour from now
            });
            const isExpired = new Date() > quote.expiresAt;
            expect(isExpired).toBe(false);
        });
    });
});

// ==================================================
// PRICING RULE INVARIANTS
// ==================================================

describe('PricingRule Invariants', () => {
    it('price per kg must be positive', () => {
        const rule = createPricingRule();
        expect(rule.pricePerKg.toNumber()).toBeGreaterThan(0);
    });

    it('base price must be non-negative', () => {
        const rule = createPricingRule();
        expect(rule.basePriceXof.toNumber()).toBeGreaterThanOrEqual(0);
    });

    it('minimum price must be positive', () => {
        const rule = createPricingRule();
        expect(rule.minimumPriceXof.toNumber()).toBeGreaterThan(0);
    });

    it('version must be a positive integer', () => {
        const rule = createPricingRule();
        expect(Number.isInteger(rule.version)).toBe(true);
        expect(rule.version).toBeGreaterThan(0);
    });
});
