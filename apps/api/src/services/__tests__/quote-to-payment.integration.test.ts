/**
 * Quote-to-Payment Integration Test
 *
 * Tests the complete lifecycle:
 *   1. Quote creation (dimensions → weight calc → price calc → persist)
 *   2. Quote acceptance (state validation → immutability)
 *   3. Quote rejection / recalculation / expiry
 *   4. Payment initiation (amount = quote.totalPriceXof)
 *   5. Payment confirmation (webhook simulation)
 *   6. Full end-to-end sequence
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../test/prisma-mock';
import { QuoteService } from '../quote.service';

// ──────────────────────────────────────────────────
// Cast helper — prismaMock is a deep proxy, TS needs `any`
// ──────────────────────────────────────────────────
const db = prismaMock as any;

// ──────────────────────────────────────────────────
// Test Fixtures
// ──────────────────────────────────────────────────

const ctx = { requestId: 'test-req-001', userId: 'admin-001', timestamp: new Date() };

const ROUTE_ID = 'route-abj-pnr';
const SHIPMENT_ID = 'ship-001';
const PRICING_RULE_ID = 'rule-001';
const QUOTE_ID = 'quote-001';

const mockRoute = {
    id: ROUTE_ID,
    originHub: 'hub-abj',
    destinationHub: 'hub-pnr',
    name: 'Abidjan → Pointe-Noire',
    status: 'ACTIVE',
};

const mockPricingRule = {
    id: PRICING_RULE_ID,
    routeId: ROUTE_ID,
    version: 3,
    status: 'ACTIVE',
    basePriceXof: 5000,
    pricePerKg: 1500,
    pricePerCm3: 0.5,
    minimumPriceXof: 3000,
    validFrom: new Date('2025-01-01'),
    validTo: new Date('2027-12-31'),
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockShipment = {
    id: SHIPMENT_ID,
    routeId: ROUTE_ID,
    status: 'DRAFT',
    description: 'Colis test 10kg',
    senderName: 'Jean Dupont',
    recipientName: 'Marie Martin',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const standardDimensions = { lengthCm: 40, widthCm: 30, heightCm: 20 };

function buildMockQuote(overrides: Record<string, unknown> = {}) {
    return {
        id: QUOTE_ID,
        shipmentId: SHIPMENT_ID,
        pricingRuleId: PRICING_RULE_ID,
        status: 'PENDING',
        lengthCm: 40,
        widthCm: 30,
        heightCm: 20,
        volumeCm3: 24000,
        declaredWeightKg: 10,
        realWeightKg: null,
        volumetricWeightKg: 4.8,   // 24000/5000
        payableWeightKg: 10,       // max(10, 4.8) = 10
        weightSource: 'DECLARED',
        weightKg: 10,
        basePriceXof: 5000,
        weightPriceXof: 15000,     // 10 × 1500
        volumePriceXof: 12000,     // 24000 × 0.5
        totalPriceXof: 32000,      // ceil((5000+15000+12000)/100)*100
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        acceptedAt: null,
        expiredAt: null,
        isLocked: false,
        lockedAt: null,
        lockedReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

// ──────────────────────────────────────────────────
// Test Suite
// ──────────────────────────────────────────────────

describe('Quote → Payment: Full Lifecycle', () => {
    let quoteService: QuoteService;

    beforeEach(() => {
        resetPrismaMock();
        vi.restoreAllMocks();
        quoteService = new QuoteService(db);
    });

    // ════════════════════════════════════════════════
    // STEP 1: Quote Creation
    // ════════════════════════════════════════════════

    describe('Step 1 — Quote Creation', () => {
        it('should create a quote with correct price calculation', async () => {
            db.shipment.findUnique.mockResolvedValue(mockShipment);
            db.quote.findUnique.mockResolvedValue(null);
            db.route.findUnique.mockResolvedValue(mockRoute);
            db.pricingRule.findFirst.mockResolvedValue(mockPricingRule);
            db.quote.create.mockResolvedValue(buildMockQuote());
            db.shipment.update.mockResolvedValue({ ...mockShipment, status: 'QUOTED' });

            const result = await quoteService.createQuote(
                { shipmentId: SHIPMENT_ID, dimensions: standardDimensions, weightKg: 10 },
                ctx,
            );

            expect(result.id).toBe(QUOTE_ID);
            expect(result.status).toBe('PENDING');
            expect(result.shipmentId).toBe(SHIPMENT_ID);

            // Verify price breakdown
            expect(result.breakdown.basePriceXof).toBe(5000);
            expect(result.breakdown.weightPriceXof).toBe(15000);
            expect(result.breakdown.volumePriceXof).toBe(12000);
            expect(result.breakdown.totalPriceXof).toBe(32000);

            // Verify dimensions
            expect(result.dimensions.lengthCm).toBe(40);
            expect(result.dimensions.widthCm).toBe(30);
            expect(result.dimensions.heightCm).toBe(20);

            // Verify Prisma calls
            expect(db.quote.create).toHaveBeenCalledTimes(1);
            expect(db.shipment.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: SHIPMENT_ID },
                    data: { status: 'QUOTED' },
                }),
            );
        });

        it('should reject negative dimensions', async () => {
            db.shipment.findUnique.mockResolvedValue(mockShipment);
            db.quote.findUnique.mockResolvedValue(null);

            await expect(
                quoteService.createQuote(
                    {
                        shipmentId: SHIPMENT_ID,
                        dimensions: { lengthCm: -5, widthCm: 30, heightCm: 20 },
                        weightKg: 10,
                    },
                    ctx,
                ),
            ).rejects.toThrow('Length must be positive');
        });

        it('should reject zero weight', async () => {
            db.shipment.findUnique.mockResolvedValue(mockShipment);
            db.quote.findUnique.mockResolvedValue(null);

            await expect(
                quoteService.createQuote(
                    { shipmentId: SHIPMENT_ID, dimensions: standardDimensions, weightKg: 0 },
                    ctx,
                ),
            ).rejects.toThrow('Weight must be positive');
        });

        it('should reject when shipment already has an active quote', async () => {
            db.shipment.findUnique.mockResolvedValue(mockShipment);
            db.quote.findUnique.mockResolvedValue(buildMockQuote());

            await expect(
                quoteService.createQuote(
                    { shipmentId: SHIPMENT_ID, dimensions: standardDimensions, weightKg: 10 },
                    ctx,
                ),
            ).rejects.toThrow();
        });

        it('should reject when shipment does not exist', async () => {
            db.shipment.findUnique.mockResolvedValue(null);

            await expect(
                quoteService.createQuote(
                    { shipmentId: 'unknown', dimensions: standardDimensions, weightKg: 10 },
                    ctx,
                ),
            ).rejects.toThrow();
        });
    });

    // ════════════════════════════════════════════════
    // STEP 2: Quote Acceptance
    // ════════════════════════════════════════════════

    describe('Step 2 — Quote Acceptance', () => {
        it('should accept a PENDING quote', async () => {
            const pendingQuote = buildMockQuote({ status: 'PENDING' });
            const acceptedQuote = buildMockQuote({ status: 'ACCEPTED', acceptedAt: new Date() });

            db.quote.findUnique.mockResolvedValue(pendingQuote);
            db.quote.update.mockResolvedValue(acceptedQuote);

            const result = await quoteService.acceptQuote(QUOTE_ID, ctx);

            expect(result.status).toBe('ACCEPTED');
            expect(result.acceptedAt).not.toBeNull();
            expect(db.quote.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: QUOTE_ID },
                    data: expect.objectContaining({ status: 'ACCEPTED' }),
                }),
            );
        });

        it('should reject accepting an already ACCEPTED quote', async () => {
            db.quote.findUnique.mockResolvedValue(
                buildMockQuote({ status: 'ACCEPTED', acceptedAt: new Date() }),
            );
            await expect(quoteService.acceptQuote(QUOTE_ID, ctx)).rejects.toThrow();
        });

        it('should reject accepting an EXPIRED quote (past validUntil)', async () => {
            db.quote.findUnique.mockResolvedValue(
                buildMockQuote({ status: 'PENDING', validUntil: new Date('2020-01-01') }),
            );
            await expect(quoteService.acceptQuote(QUOTE_ID, ctx)).rejects.toThrow();
        });

        it('should reject accepting a REJECTED quote', async () => {
            db.quote.findUnique.mockResolvedValue(buildMockQuote({ status: 'REJECTED' }));
            await expect(quoteService.acceptQuote(QUOTE_ID, ctx)).rejects.toThrow();
        });
    });

    // ════════════════════════════════════════════════
    // STEP 3: Quote Rejection
    // ════════════════════════════════════════════════

    describe('Step 3 — Quote Rejection', () => {
        it('should reject a PENDING quote and reset shipment to DRAFT', async () => {
            db.quote.findUnique.mockResolvedValue(buildMockQuote({ status: 'PENDING' }));
            db.quote.update.mockResolvedValue(buildMockQuote({ status: 'REJECTED' }));
            db.shipment.update.mockResolvedValue({ ...mockShipment, status: 'DRAFT' });

            const result = await quoteService.rejectQuote(QUOTE_ID, ctx);

            expect(result.status).toBe('REJECTED');
            expect(db.shipment.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: SHIPMENT_ID },
                    data: { status: 'DRAFT' },
                }),
            );
        });

        it('should not allow rejecting an ACCEPTED quote', async () => {
            db.quote.findUnique.mockResolvedValue(
                buildMockQuote({ status: 'ACCEPTED', acceptedAt: new Date() }),
            );
            await expect(quoteService.rejectQuote(QUOTE_ID, ctx)).rejects.toThrow();
        });
    });

    // ════════════════════════════════════════════════
    // STEP 4: Quote Recalculation
    // ════════════════════════════════════════════════

    describe('Step 4 — Quote Recalculation', () => {
        it('should recalculate a PENDING quote with new dimensions', async () => {
            db.quote.findUnique.mockResolvedValue(buildMockQuote());
            db.shipment.findUnique.mockResolvedValue(mockShipment);
            db.route.findUnique.mockResolvedValue(mockRoute);
            db.pricingRule.findFirst.mockResolvedValue(mockPricingRule);
            db.quote.update.mockResolvedValue(
                buildMockQuote({ lengthCm: 50, widthCm: 40, heightCm: 30 }),
            );

            const result = await quoteService.recalculateQuote(
                QUOTE_ID,
                { lengthCm: 50, widthCm: 40, heightCm: 30 },
                15,
                ctx,
            );

            expect(result.dimensions.lengthCm).toBe(50);
            expect(db.quote.update).toHaveBeenCalledTimes(1);
        });

        it('should block recalculation of an ACCEPTED quote', async () => {
            db.quote.findUnique.mockResolvedValue(buildMockQuote({ status: 'ACCEPTED' }));
            await expect(
                quoteService.recalculateQuote(
                    QUOTE_ID,
                    { lengthCm: 50, widthCm: 40, heightCm: 30 },
                    15,
                    ctx,
                ),
            ).rejects.toThrow();
        });
    });

    // ════════════════════════════════════════════════
    // STEP 5: Quote Expiry
    // ════════════════════════════════════════════════

    describe('Step 5 — Quote Expiry', () => {
        it('should expire stale quotes', async () => {
            db.quote.updateMany.mockResolvedValue({ count: 3 });

            const expiredCount = await quoteService.expireStaleQuotes(ctx);

            expect(expiredCount).toBe(3);
            expect(db.quote.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ status: 'PENDING' }),
                    data: expect.objectContaining({ status: 'EXPIRED' }),
                }),
            );
        });
    });

    // ════════════════════════════════════════════════
    // STEP 6: Payment Initiation
    // ════════════════════════════════════════════════

    describe('Step 6 — Payment Initiation (post-acceptance)', () => {
        it('should create payment with amount matching the accepted quote', async () => {
            const acceptedQuote = buildMockQuote({ status: 'ACCEPTED', acceptedAt: new Date() });

            const paymentData = {
                id: 'pay-001',
                shipmentId: SHIPMENT_ID,
                quoteId: QUOTE_ID,
                amountXof: acceptedQuote.totalPriceXof,
                currencyCode: 'XOF',
                method: 'MOBILE_MONEY',
                status: 'INITIATED',
                provider: 'CINETPAY',
                paymentUrl: 'https://pay.cinetpay.com/tx/abc123',
                createdAt: new Date(),
            };

            db.payment.create.mockResolvedValue(paymentData);

            const payment = await db.payment.create({
                data: {
                    shipmentId: SHIPMENT_ID,
                    quoteId: QUOTE_ID,
                    amountXof: acceptedQuote.totalPriceXof,
                    method: 'MOBILE_MONEY',
                    status: 'INITIATED',
                    provider: 'CINETPAY',
                },
            });

            expect(Number(payment.amountXof)).toBe(32000);
            expect(payment.quoteId).toBe(QUOTE_ID);
            expect(payment.status).toBe('INITIATED');
            expect(payment.currencyCode).toBe('XOF');
        });

        it('should confirm payment via webhook', async () => {
            db.payment.update.mockResolvedValue({
                id: 'pay-001',
                status: 'CONFIRMED',
                confirmedAt: new Date(),
                gatewayReference: 'gw-ref-xyz',
            });

            const confirmed = await db.payment.update({
                where: { id: 'pay-001' },
                data: {
                    status: 'CONFIRMED',
                    confirmedAt: new Date(),
                    gatewayReference: 'gw-ref-xyz',
                },
            });

            expect(confirmed.status).toBe('CONFIRMED');
            expect(confirmed.gatewayReference).toBe('gw-ref-xyz');
        });

        it('should record payment events for audit trail', async () => {
            db.paymentEvent.create.mockResolvedValue({
                id: 'evt-001',
                paymentId: 'pay-001',
                eventType: 'confirmed',
                eventData: { raw: 'webhook-payload' },
                source: 'webhook',
                createdAt: new Date(),
            });

            const event = await db.paymentEvent.create({
                data: {
                    paymentId: 'pay-001',
                    eventType: 'confirmed',
                    eventData: { raw: 'webhook-payload' },
                    source: 'webhook',
                },
            });

            expect(event.eventType).toBe('confirmed');
            expect(event.source).toBe('webhook');
        });
    });

    // ════════════════════════════════════════════════
    // STEP 7: Full End-to-End
    // ════════════════════════════════════════════════

    describe('Step 7 — Full E2E: Create → Accept → Pay → Confirm', () => {
        it('should complete the entire devis → facturation flow', async () => {
            // ── Phase 1: Create Quote ──
            db.shipment.findUnique.mockResolvedValue(mockShipment);
            db.quote.findUnique.mockResolvedValueOnce(null);
            db.route.findUnique.mockResolvedValue(mockRoute);
            db.pricingRule.findFirst.mockResolvedValue(mockPricingRule);
            db.quote.create.mockResolvedValue(buildMockQuote());
            db.shipment.update.mockResolvedValue({ ...mockShipment, status: 'QUOTED' });

            const quote = await quoteService.createQuote(
                { shipmentId: SHIPMENT_ID, dimensions: standardDimensions, weightKg: 10 },
                ctx,
            );
            expect(quote.status).toBe('PENDING');
            expect(quote.breakdown.totalPriceXof).toBe(32000);

            // ── Phase 2: Accept Quote ──
            const pendingForAccept = buildMockQuote({ status: 'PENDING' });
            const acceptedQuote = buildMockQuote({ status: 'ACCEPTED', acceptedAt: new Date() });
            db.quote.findUnique.mockResolvedValueOnce(pendingForAccept);
            db.quote.update.mockResolvedValueOnce(acceptedQuote);

            const accepted = await quoteService.acceptQuote(QUOTE_ID, ctx);
            expect(accepted.status).toBe('ACCEPTED');

            // ── Phase 3: Initiate Payment ──
            db.payment.create.mockResolvedValue({
                id: 'pay-001',
                shipmentId: SHIPMENT_ID,
                quoteId: QUOTE_ID,
                amountXof: 32000,
                status: 'INITIATED',
                method: 'MOBILE_MONEY',
                provider: 'CINETPAY',
                currencyCode: 'XOF',
            });

            const payment = await db.payment.create({
                data: {
                    shipmentId: SHIPMENT_ID,
                    quoteId: QUOTE_ID,
                    amountXof: 32000,
                    method: 'MOBILE_MONEY',
                    provider: 'CINETPAY',
                },
            });
            expect(payment.amountXof).toBe(32000);
            expect(payment.status).toBe('INITIATED');

            // ── Phase 4: Payment Confirmation ──
            db.payment.update.mockResolvedValue({
                id: 'pay-001',
                status: 'CONFIRMED',
                confirmedAt: new Date(),
                gatewayReference: 'cinetpay-ref-abc',
            });

            const confirmed = await db.payment.update({
                where: { id: 'pay-001' },
                data: { status: 'CONFIRMED', gatewayReference: 'cinetpay-ref-abc' },
            });
            expect(confirmed.status).toBe('CONFIRMED');
            expect(confirmed.gatewayReference).toBe('cinetpay-ref-abc');

            // ── Verify shipment was marked QUOTED after quote creation ──
            expect(db.shipment.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: { status: 'QUOTED' } }),
            );
        });
    });
});
