/**
 * Financial Ledger Service Tests
 * 
 * Tests for immutable ledger entries, compensating entries, and reconciliation.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { LedgerService, LedgerError } from './ledger.service';
import { prisma } from '../lib/prisma';
import type { PrismaClient } from '@prisma/client';

// ==================================================
// TEST CONFIGURATION
// ==================================================

let ledgerService: LedgerService;

// Test data IDs
let testUserId: string;
let testHubId: string;
let testRouteId: string;
let testPricingRuleId: string;
let testShipmentId: string;
let testQuoteId: string;
let testPaymentId: string;
let testScanResultId: string;

// ==================================================
// SETUP & TEARDOWN
// ==================================================

beforeAll(async () => {
    ledgerService = new LedgerService(prisma);
});

beforeEach(async () => {
    // Clean up test data in correct order (respecting foreign keys)
    await prisma.financialLedgerEntry.deleteMany({});
    await prisma.paymentEvent.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.scanResult.deleteMany({});
    await prisma.quote.deleteMany({});
    await prisma.shipment.deleteMany({});
    await prisma.pricingRule.deleteMany({});
    await prisma.route.deleteMany({});
    await prisma.hub.deleteMany({});
    await prisma.user.deleteMany({});

    // Create test user
    const user = await prisma.user.create({
        data: {
            phone: '+2250700000001',
            passwordHash: 'test',
            firstName: 'Test',
            lastName: 'User',
            role: 'CUSTOMER',
        },
    });
    testUserId = user.id;

    // Create test hubs
    const originHub = await prisma.hub.create({
        data: {
            code: 'ABJ-TEST-01',
            name: 'Test Origin Hub',
            status: 'ACTIVE',
            addressLine1: '123 Test Street',
            city: 'Abidjan',
            region: 'Lagunes',
            country: 'CI',
            latitude: 5.3167,
            longitude: -4.0333,
        },
    });
    testHubId = originHub.id;

    const destHub = await prisma.hub.create({
        data: {
            code: 'YAM-TEST-01',
            name: 'Test Destination Hub',
            status: 'ACTIVE',
            addressLine1: '456 Dest Street',
            city: 'Yamoussoukro',
            region: 'Lacs',
            country: 'CI',
            latitude: 6.8200,
            longitude: -5.2700,
        },
    });

    // Create test route
    const route = await prisma.route.create({
        data: {
            code: 'ABJ-YAM-TEST',
            status: 'ACTIVE',
            originHubId: originHub.id,
            destinationHubId: destHub.id,
            distanceKm: 250,
            durationMinutes: 180,
        },
    });
    testRouteId = route.id;

    // Create test pricing rule
    const pricingRule = await prisma.pricingRule.create({
        data: {
            routeId: route.id,
            version: 1,
            status: 'ACTIVE',
            basePriceXof: 2000,
            pricePerKg: 500,
            pricePerCm3: 0.05,
            minimumPriceXof: 1500,
            maximumWeightKg: 50,
            effectiveFrom: new Date(),
            createdById: user.id,
        },
    });
    testPricingRuleId = pricingRule.id;

    // Create test shipment
    const shipment = await prisma.shipment.create({
        data: {
            trackingCode: 'TL-TEST-001',
            status: 'CREATED',
            customerId: user.id,
            routeId: route.id,
            originAddressLine1: '123 Origin St',
            originCity: 'Abidjan',
            originPhone: '+2250700000002',
            originContactName: 'Sender Test',
            destAddressLine1: '456 Dest St',
            destCity: 'Yamoussoukro',
            destPhone: '+2250700000003',
            destContactName: 'Receiver Test',
            packageDescription: 'Test package',
        },
    });
    testShipmentId = shipment.id;

    // Create test quote
    const quote = await prisma.quote.create({
        data: {
            shipmentId: shipment.id,
            pricingRuleId: pricingRule.id,
            status: 'ACCEPTED',
            lengthCm: 30,
            widthCm: 20,
            heightCm: 15,
            volumeCm3: 9000,
            volumetricWeightKg: 1.8,
            payableWeightKg: 2.5,
            weightKg: 2.5,
            basePriceXof: 2000,
            weightPriceXof: 1250,
            volumePriceXof: 450,
            totalPriceXof: 3700,
            validUntil: new Date(Date.now() + 86400000),
            isLocked: true,
        },
    });
    testQuoteId = quote.id;

    // Create test scan result
    const scanResult = await prisma.scanResult.create({
        data: {
            shipmentId: shipment.id,
            status: 'VALIDATED',
            source: 'AI',
            inputImageHash: 'abc123',
            detectedLengthCm: 30,
            detectedWidthCm: 20,
            detectedHeightCm: 15,
            confidenceScore: 0.92,
            modelVersion: 'v0.1.0',
        },
    });
    testScanResultId = scanResult.id;

    // Create test payment (CONFIRMED)
    const payment = await prisma.payment.create({
        data: {
            shipmentId: shipment.id,
            quoteId: quote.id,
            status: 'CONFIRMED',
            method: 'MOBILE_MONEY',
            provider: 'CINETPAY',
            amountXof: 3700,
            currencyCode: 'XOF',
            gatewayReference: 'CINETPAY-REF-123',
            confirmedAt: new Date(),
        },
    });
    testPaymentId = payment.id;
});

afterAll(async () => {
    await prisma.$disconnect();
});

// ==================================================
// TESTS
// ==================================================

describe('LedgerService', () => {
    describe('recordConfirmedPayment', () => {
        it('should create CREDIT entry on confirmed payment', async () => {
            const entry = await ledgerService.recordConfirmedPayment(testPaymentId);

            expect(entry).toBeDefined();
            expect(entry.id).toBeDefined();
            expect(entry.entryType).toBe('CREDIT');
            expect(Number(entry.amountXof)).toBe(3700);
            expect(entry.currencyCode).toBe('XOF');
            expect(entry.paymentId).toBe(testPaymentId);
            expect(entry.quoteId).toBe(testQuoteId);
            expect(entry.shipmentId).toBe(testShipmentId);
            expect(entry.pricingRuleId).toBe(testPricingRuleId);
            expect(entry.pricingRuleVersion).toBe(1);
            expect(entry.providerReference).toBe('CINETPAY-REF-123');
            expect(entry.providerName).toBe('CINETPAY');
        });

        it('should be idempotent - return existing entry', async () => {
            // First call
            const entry1 = await ledgerService.recordConfirmedPayment(testPaymentId);

            // Second call (should return same entry)
            const entry2 = await ledgerService.recordConfirmedPayment(testPaymentId);

            expect(entry1.id).toBe(entry2.id);

            // Verify only one entry exists
            const entries = await ledgerService.getLedgerByPayment(testPaymentId);
            expect(entries.length).toBe(1);
        });

        it('should reject non-confirmed payment', async () => {
            // Update payment to PENDING
            await prisma.payment.update({
                where: { id: testPaymentId },
                data: { status: 'PENDING' },
            });

            await expect(
                ledgerService.recordConfirmedPayment(testPaymentId)
            ).rejects.toThrow(LedgerError);
        });

        it('should link pricing rule version for audit', async () => {
            const entry = await ledgerService.recordConfirmedPayment(testPaymentId);

            expect(entry.pricingRuleId).toBe(testPricingRuleId);
            expect(entry.pricingRuleVersion).toBe(1);
        });
    });

    describe('recordCompensatingEntry', () => {
        it('should create DEBIT entry for compensation', async () => {
            // Create original entry
            const original = await ledgerService.recordConfirmedPayment(testPaymentId);

            // Create compensating entry
            const compensation = await ledgerService.recordCompensatingEntry(
                original.id,
                'Customer refund requested'
            );

            expect(compensation).toBeDefined();
            expect(compensation.entryType).toBe('DEBIT');
            expect(Number(compensation.amountXof)).toBe(Number(original.amountXof));
            expect(compensation.compensatesEntryId).toBe(original.id);
            expect(compensation.compensationReason).toBe('Customer refund requested');
        });

        it('should prevent double compensation', async () => {
            // Create original entry
            const original = await ledgerService.recordConfirmedPayment(testPaymentId);

            // First compensation
            await ledgerService.recordCompensatingEntry(original.id, 'First refund');

            // Second compensation should fail
            await expect(
                ledgerService.recordCompensatingEntry(original.id, 'Second refund')
            ).rejects.toThrow('already compensated');
        });

        it('should only compensate CREDIT entries', async () => {
            // Create CREDIT entry
            const original = await ledgerService.recordConfirmedPayment(testPaymentId);

            // Create DEBIT compensation
            const compensation = await ledgerService.recordCompensatingEntry(
                original.id,
                'Test'
            );

            // Try to compensate the DEBIT entry (should fail)
            await expect(
                ledgerService.recordCompensatingEntry(compensation.id, 'Invalid')
            ).rejects.toThrow('CREDIT entries');
        });
    });

    describe('getReconciliationReport', () => {
        it('should calculate correct totals', async () => {
            // Create ledger entries directly to test reconciliation
            await prisma.financialLedgerEntry.createMany({
                data: [
                    {
                        entryType: 'CREDIT',
                        amountXof: 3700,
                        currencyCode: 'XOF',
                        paymentId: testPaymentId,
                        shipmentId: testShipmentId,
                        providerName: 'CINETPAY',
                    },
                    {
                        entryType: 'CREDIT',
                        amountXof: 5000,
                        currencyCode: 'XOF',
                        paymentId: testPaymentId,
                        shipmentId: testShipmentId,
                        providerName: 'STRIPE',
                    },
                    {
                        entryType: 'DEBIT',
                        amountXof: 1000,
                        currencyCode: 'XOF',
                        paymentId: testPaymentId,
                        shipmentId: testShipmentId,
                        providerName: 'CINETPAY',
                        compensationReason: 'Partial refund',
                    },
                ],
            });

            const report = await ledgerService.getReconciliationReport(
                new Date(Date.now() - 86400000), // Yesterday
                new Date(Date.now() + 86400000)  // Tomorrow
            );

            expect(report.grandTotal.credits).toBe(8700); // 3700 + 5000
            expect(report.grandTotal.debits).toBe(1000);
            expect(report.grandTotal.net).toBe(7700);
            expect(report.items.length).toBe(2); // CINETPAY and STRIPE
        });

        it('should group by provider and currency', async () => {
            await prisma.financialLedgerEntry.createMany({
                data: [
                    {
                        entryType: 'CREDIT',
                        amountXof: 1000,
                        currencyCode: 'XOF',
                        paymentId: testPaymentId,
                        shipmentId: testShipmentId,
                        providerName: 'CINETPAY',
                    },
                    {
                        entryType: 'CREDIT',
                        amountXof: 2000,
                        currencyCode: 'XOF',
                        paymentId: testPaymentId,
                        shipmentId: testShipmentId,
                        providerName: 'CINETPAY',
                    },
                ],
            });

            const report = await ledgerService.getReconciliationReport(
                new Date(Date.now() - 86400000),
                new Date(Date.now() + 86400000)
            );

            const cinetpayItem = report.items.find(i => i.providerName === 'CINETPAY');
            expect(cinetpayItem).toBeDefined();
            expect(cinetpayItem!.totalCredits).toBe(3000);
            expect(cinetpayItem!.entryCount).toBe(2);
        });
    });

    describe('getLedgerByShipment', () => {
        it('should return all entries for a shipment', async () => {
            // Create entry
            await ledgerService.recordConfirmedPayment(testPaymentId);

            const entries = await ledgerService.getLedgerByShipment(testShipmentId);

            expect(entries.length).toBe(1);
            expect(entries[0].shipmentId).toBe(testShipmentId);
        });
    });
});
