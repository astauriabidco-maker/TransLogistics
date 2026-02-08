/**
 * FraudResponseService — Unit Tests
 *
 * Contract R2 — 3 gates + proportionality guard:
 *   Gate 1: Global kill switch
 *   Gate 2: Signal validation
 *   Gate 3: Proportionality (hardcoded forbidden actions)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../test/prisma-mock';
import { FraudResponseService, type FraudSignal } from '../fraud-response.service';

function mockSignal(overrides: Partial<FraudSignal> = {}): FraudSignal {
    return {
        entityType: 'SHIPMENT',
        entityId: 'ship-001',
        signalType: 'WEIGHT_MISMATCH',
        severity: 'MEDIUM',
        reasoning: 'Weight deviation >30%',
        evidence: { declaredKg: 5, measuredKg: 8 },
        ...overrides,
    };
}

describe('FraudResponseService', () => {
    let service: FraudResponseService;

    beforeEach(() => {
        resetPrismaMock();
        vi.restoreAllMocks();
        service = new FraudResponseService(prismaMock as any);
    });

    // ────────────────────────────────────────────
    // Gate 1: Global kill switch
    // ────────────────────────────────────────────

    describe('Gate 1 — Global kill switch', () => {
        it('should IGNORE when global is disabled', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(false);

            const result = await service.evaluate(mockSignal());

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('globally disabled');
            expect(result.evidence.globalEnabled).toBe(false);
        });
    });

    // ────────────────────────────────────────────
    // Gate 2: Signal validation
    // ────────────────────────────────────────────

    describe('Gate 2 — Signal validation', () => {
        it('should IGNORE when signal type is unknown', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);

            const result = await service.evaluate(mockSignal({ signalType: 'UNKNOWN_TYPE' }));

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('Invalid signal');
        });

        it('should IGNORE when entity type is empty', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);

            const result = await service.evaluate(mockSignal({ entityType: '' as any }));

            expect(result.decision).toBe('IGNORE');
            expect(result.reasoning).toContain('Invalid signal');
        });

        it('should RESPOND with valid signal', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);

            const result = await service.evaluate(mockSignal());

            expect(result.decision).toBe('RESPOND');
            expect(result.evidence.signalValid).toBe(true);
        });
    });

    // ────────────────────────────────────────────
    // Proportionality guard
    // ────────────────────────────────────────────

    describe('Proportionality guard', () => {
        it('should throw for SUSPEND_ACCOUNT', () => {
            expect(() => service.assertProportional('SUSPEND_ACCOUNT')).toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should throw for BLOCK_PAYMENT', () => {
            expect(() => service.assertProportional('BLOCK_PAYMENT')).toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should throw for AUTO_REFUND', () => {
            expect(() => service.assertProportional('AUTO_REFUND')).toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should throw for FREEZE_FUNDS', () => {
            expect(() => service.assertProportional('FREEZE_FUNDS')).toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should throw for BLACKLIST', () => {
            expect(() => service.assertProportional('BLACKLIST')).toThrow('PROPORTIONALITY VIOLATION');
        });

        it('should allow FLAG action', () => {
            expect(() => service.assertProportional('FLAG')).not.toThrow();
        });

        it('should allow NOTIFY_ADMIN action', () => {
            expect(() => service.assertProportional('NOTIFY_ADMIN')).not.toThrow();
        });

        it('should allow REQUIRE_REVIEW action', () => {
            expect(() => service.assertProportional('REQUIRE_REVIEW')).not.toThrow();
        });
    });

    // ────────────────────────────────────────────
    // disableAutoValidationForHub
    // ────────────────────────────────────────────

    describe('disableAutoValidationForHub', () => {
        it('should update hub config with enabled=false', async () => {
            await (service as any).disableAutoValidationForHub('hub-001');

            expect(prismaMock.hubScanAutoValidationConfig.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { hubId: 'hub-001' },
                    data: { enabled: false },
                }),
            );
        });
    });

    // ────────────────────────────────────────────
    // All known signal types
    // ────────────────────────────────────────────

    describe('Known signal types', () => {
        const knownTypes = [
            'WEIGHT_MISMATCH', 'REFUND_SPIKE', 'VOLUME_ANOMALY',
            'DUPLICATE_SHIPMENT', 'ADDRESS_PATTERN', 'VELOCITY_ANOMALY',
            'PRICE_MANIPULATION',
        ];

        knownTypes.forEach((type) => {
            it(`should RESPOND to ${type}`, async () => {
                vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);
                const result = await service.evaluate(mockSignal({ signalType: type }));
                expect(result.decision).toBe('RESPOND');
            });
        });
    });

    // ────────────────────────────────────────────
    // Evidence structure
    // ────────────────────────────────────────────

    describe('Evidence', () => {
        it('should always include R2 contract evidence', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(false);

            const result = await service.evaluate(mockSignal());

            expect(result.evidence).toMatchObject({
                contratId: 'R2',
                zone: 'RESTRICTED',
                module: 'FRAUD',
            });
        });
    });
});
