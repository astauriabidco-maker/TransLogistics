/**
 * Fraud Response Automation — Governance Tests
 *
 * Tests the FraudResponseService (Contract R2).
 * Validates evaluation gates, soft actions, proportionality enforcement,
 * human resolution, and audit evidence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FraudResponseService } from '../../services/fraud-response.service';
import type { FraudSignal } from '../../services/fraud-response.service';

// ==================================================
// MOCK PRISMA
// ==================================================

function createMockPrisma() {
    return {
        fraudAlert: {
            create: vi.fn().mockResolvedValue({ id: 'alert-001' }),
            update: vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue(null),
        },
        hubScanAutoValidationConfig: {
            update: vi.fn().mockResolvedValue({}),
        },
    } as any;
}

// ==================================================
// HELPERS
// ==================================================

function makeSignal(overrides: Partial<FraudSignal> = {}): FraudSignal {
    return {
        entityType: 'SHIPMENT',
        entityId: 'ship-001',
        signalType: 'WEIGHT_MISMATCH',
        severity: 'MEDIUM',
        reasoning: 'Declared weight 5kg but scanned at 25kg — 400% discrepancy',
        evidence: {
            declaredWeightKg: 5,
            scannedWeightKg: 25,
            discrepancyPercent: 400,
        },
        sourceModel: 'weight-anomaly-detector-v1.2',
        hubId: 'hub-abj',
        ...overrides,
    };
}

// ==================================================
// TESTS
// ==================================================

describe('FraudResponseService', () => {
    let service: FraudResponseService;
    let prisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
        prisma = createMockPrisma();
        service = new FraudResponseService(prisma);
        process.env['FRAUD_AUTO_RESPONSE_ENABLED'] = 'true';
    });

    afterEach(() => {
        delete process.env['FRAUD_AUTO_RESPONSE_ENABLED'];
        vi.restoreAllMocks();
    });

    // --------------------------------------------------
    // Gate 1: Global Kill Switch
    // --------------------------------------------------

    describe('Global Kill Switch', () => {
        it('should IGNORE when global switch is OFF', () => {
            process.env['FRAUD_AUTO_RESPONSE_ENABLED'] = 'false';

            const result = service.evaluate(makeSignal());

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('globally disabled');
            expect(result.evidence.globalEnabled).toBe(false);
        });

        it('should IGNORE when env var is missing', () => {
            delete process.env['FRAUD_AUTO_RESPONSE_ENABLED'];

            const result = service.evaluate(makeSignal());

            expect(result.decision).toBe('IGNORE');
        });
    });

    // --------------------------------------------------
    // Gate 2: Signal Validation
    // --------------------------------------------------

    describe('Signal Validation', () => {
        it('should IGNORE when entityType is missing', () => {
            const result = service.evaluate(makeSignal({ entityType: '' as any }));

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('Missing entityType');
        });

        it('should IGNORE when entityId is missing', () => {
            const result = service.evaluate(makeSignal({ entityId: '' }));

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('Missing entityType or entityId');
        });

        it('should IGNORE when signalType is missing', () => {
            const result = service.evaluate(makeSignal({ signalType: '' }));

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('Missing signalType');
        });

        it('should IGNORE when severity is invalid', () => {
            const result = service.evaluate(makeSignal({ severity: 'CRITICAL' as any }));

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('Invalid severity');
        });

        it('should IGNORE when reasoning is empty', () => {
            const result = service.evaluate(makeSignal({ reasoning: '' }));

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('Missing reasoning');
        });

        it('should IGNORE when signalType is unknown', () => {
            const result = service.evaluate(makeSignal({ signalType: 'MADE_UP_SIGNAL' }));

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('Unknown signal type');
        });

        it('should RESPOND for valid signal', () => {
            const result = service.evaluate(makeSignal());

            expect(result.decision).toBe('RESPOND');
            expect(result.evidence.signalValid).toBe(true);
        });
    });

    // --------------------------------------------------
    // Gate 3: Proportionality Guard
    // --------------------------------------------------

    describe('Proportionality Guard', () => {
        it('should throw on SUSPEND_ACCOUNT', () => {
            expect(() => service.assertProportional('SUSPEND_ACCOUNT'))
                .toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should throw on BLOCK_PAYMENT', () => {
            expect(() => service.assertProportional('BLOCK_PAYMENT'))
                .toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should throw on DISABLE_CUSTOMER', () => {
            expect(() => service.assertProportional('DISABLE_CUSTOMER'))
                .toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should throw on AUTO_REFUND', () => {
            expect(() => service.assertProportional('AUTO_REFUND'))
                .toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should throw on FREEZE_FUNDS', () => {
            expect(() => service.assertProportional('FREEZE_FUNDS'))
                .toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should allow FLAG_ENTITY', () => {
            expect(() => service.assertProportional('FLAG_ENTITY')).not.toThrow();
        });

        it('should allow ADMIN_NOTIFICATION', () => {
            expect(() => service.assertProportional('ADMIN_NOTIFICATION')).not.toThrow();
        });

        it('should allow REQUIRE_REVIEW', () => {
            expect(() => service.assertProportional('REQUIRE_REVIEW')).not.toThrow();
        });
    });

    // --------------------------------------------------
    // Respond
    // --------------------------------------------------

    describe('Respond', () => {
        it('should create FraudAlert and return actions', async () => {
            const result = await service.respond(makeSignal());

            expect(result.decision).toBe('RESPOND');
            expect(result.alertId).toBe('alert-001');
            expect(result.actionsTaken.length).toBeGreaterThanOrEqual(2);

            const actionNames = result.actionsTaken.map(a => a.action);
            expect(actionNames).toContain('FLAG_ENTITY');
            expect(actionNames).toContain('ADMIN_NOTIFICATION');
        });

        it('should disable auto-validation for hub on MEDIUM/HIGH severity', async () => {
            await service.respond(makeSignal({ severity: 'MEDIUM', hubId: 'hub-abj' }));

            expect(prisma.hubScanAutoValidationConfig.update).toHaveBeenCalledWith({
                where: { hubId: 'hub-abj' },
                data: { enabled: false },
            });
        });

        it('should NOT disable auto-validation on LOW severity', async () => {
            await service.respond(makeSignal({ severity: 'LOW', hubId: 'hub-abj' }));

            expect(prisma.hubScanAutoValidationConfig.update).not.toHaveBeenCalled();
        });

        it('should transition alert to UNDER_REVIEW', async () => {
            await service.respond(makeSignal());

            expect(prisma.fraudAlert.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'alert-001' },
                    data: expect.objectContaining({ status: 'UNDER_REVIEW' }),
                })
            );
        });

        it('should IGNORE when global switch is OFF', async () => {
            process.env['FRAUD_AUTO_RESPONSE_ENABLED'] = 'false';

            const result = await service.respond(makeSignal());

            expect(result.decision).toBe('IGNORE');
            expect(result.actionsTaken).toHaveLength(0);
            expect(prisma.fraudAlert.create).not.toHaveBeenCalled();
        });
    });

    // --------------------------------------------------
    // Resolve (Human-Only)
    // --------------------------------------------------

    describe('Resolve', () => {
        it('should resolve alert with human identity', async () => {
            prisma.fraudAlert.findUnique.mockResolvedValue({
                id: 'alert-001',
                status: 'UNDER_REVIEW',
            });

            const result = await service.resolve('alert-001', 'FALSE_POSITIVE', 'admin-1');

            expect(result.resolution).toBe('FALSE_POSITIVE');
            expect(result.resolvedBy).toBe('admin-1');
            expect(prisma.fraudAlert.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: 'RESOLVED',
                        resolution: 'FALSE_POSITIVE',
                        resolvedById: 'admin-1',
                    }),
                })
            );
        });

        it('should reject resolution without human identity', async () => {
            await expect(
                service.resolve('alert-001', 'CONFIRMED_FRAUD', '')
            ).rejects.toThrow('Human resolver identity is required');
        });

        it('should throw when alert not found', async () => {
            prisma.fraudAlert.findUnique.mockResolvedValue(null);

            await expect(
                service.resolve('alert-999', 'CONFIRMED_FRAUD', 'admin-1')
            ).rejects.toThrow('not found');
        });

        it('should throw when alert already resolved', async () => {
            prisma.fraudAlert.findUnique.mockResolvedValue({
                id: 'alert-001',
                status: 'RESOLVED',
            });

            await expect(
                service.resolve('alert-001', 'CONFIRMED_FRAUD', 'admin-1')
            ).rejects.toThrow('already resolved');
        });
    });

    // --------------------------------------------------
    // Audit Evidence
    // --------------------------------------------------

    describe('Audit Evidence', () => {
        it('should always include R2/RESTRICTED contract metadata', () => {
            const result = service.evaluate(makeSignal());

            expect(result.evidence.contratId).toBe('R2');
            expect(result.evidence.zone).toBe('RESTRICTED');
            expect(result.evidence.module).toBe('FRAUD');
        });

        it('should include signal details in evidence', () => {
            const result = service.evaluate(makeSignal({
                signalType: 'REFUND_SPIKE',
                severity: 'HIGH',
            }));

            expect(result.evidence.signalType).toBe('REFUND_SPIKE');
            expect(result.evidence.severity).toBe('HIGH');
        });

        it('should include evaluatedAt timestamp', () => {
            const result = service.evaluate(makeSignal());

            expect(result.evidence.evaluatedAt).toBeDefined();
            expect(new Date(result.evidence.evaluatedAt).getTime()).not.toBeNaN();
        });
    });
});
