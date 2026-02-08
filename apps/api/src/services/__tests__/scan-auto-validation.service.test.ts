/**
 * ScanAutoValidationService — Unit Tests
 *
 * Contract S1 — 5 gates:
 *   Gate 1: Global kill switch
 *   Gate 2: Per-hub kill switch
 *   Gate 3: Confidence threshold
 *   Gate 4: Historical error rate
 *   Gate 5: Quote guard (accepted quote blocks auto-validation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../test/prisma-mock';
import { ScanAutoValidationService, type ScanDataForEvaluation } from '../scan-auto-validation.service';

// Default scan input for tests
function mockScan(overrides: Partial<ScanDataForEvaluation> = {}): ScanDataForEvaluation {
    return {
        scanResultId: 'scan-001',
        shipmentId: 'ship-001',
        hubId: 'hub-001',
        confidenceScore: 0.92,
        modelVersion: 'v2.3',
        ...overrides,
    };
}

describe('ScanAutoValidationService', () => {
    let service: ScanAutoValidationService;

    beforeEach(() => {
        resetPrismaMock();
        vi.restoreAllMocks();
        service = new ScanAutoValidationService(prismaMock as any);
    });

    // ────────────────────────────────────────────
    // Gate 1: Global kill switch
    // ────────────────────────────────────────────

    describe('Gate 1 — Global kill switch', () => {
        it('should REQUIRE_MANUAL when global is disabled', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(false);

            const result = await service.evaluate(mockScan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('globally disabled');
            expect(result.evidence.globalEnabled).toBe(false);
        });
    });

    // ────────────────────────────────────────────
    // Gate 2: Hub kill switch
    // ────────────────────────────────────────────

    describe('Gate 2 — Hub kill switch', () => {
        it('should REQUIRE_MANUAL when hub config missing', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue(null);

            const result = await service.evaluate(mockScan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.evidence.hubEnabled).toBe(false);
        });

        it('should REQUIRE_MANUAL when hub is disabled', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue({
                hubId: 'hub-001',
                enabled: false,
                confidenceThreshold: 0.85,
                maxErrorRatePercent: 15,
                lookbackSampleSize: 50,
                errorTolerancePercent: 10,
            } as any);

            const result = await service.evaluate(mockScan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('disabled');
        });
    });

    // ────────────────────────────────────────────
    // Gate 3: Confidence threshold
    // ────────────────────────────────────────────

    describe('Gate 3 — Confidence threshold', () => {
        it('should REQUIRE_MANUAL when confidence below threshold', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue({
                hubId: 'hub-001',
                enabled: true,
                confidenceThreshold: 0.90,
                maxErrorRatePercent: 15,
                lookbackSampleSize: 50,
                errorTolerancePercent: 10,
            } as any);

            const result = await service.evaluate(mockScan({ confidenceScore: 0.85 }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('below threshold');
        });

        it('should pass when confidence equals threshold', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue({
                hubId: 'hub-001',
                enabled: true,
                confidenceThreshold: 0.90,
                maxErrorRatePercent: 15,
                lookbackSampleSize: 50,
                errorTolerancePercent: 10,
            } as any);
            vi.spyOn(service, 'computeHistoricalErrorRate').mockResolvedValue(5);
            prismaMock.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(mockScan({ confidenceScore: 0.90 }));

            expect(result.decision).toBe('AUTO_VALIDATE');
        });
    });

    // ────────────────────────────────────────────
    // Gate 4: Historical error rate
    // ────────────────────────────────────────────

    describe('Gate 4 — Historical error rate', () => {
        it('should REQUIRE_MANUAL when error rate exceeds max', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue({
                hubId: 'hub-001',
                enabled: true,
                confidenceThreshold: 0.85,
                maxErrorRatePercent: 15,
                lookbackSampleSize: 50,
                errorTolerancePercent: 10,
            } as any);
            vi.spyOn(service, 'computeHistoricalErrorRate').mockResolvedValue(20);

            const result = await service.evaluate(mockScan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('error rate');
            expect(result.evidence.historicalErrorRate).toBe(20);
        });

        it('should return 0% error rate when no historical data', async () => {
            const rate = await service.computeHistoricalErrorRate('hub-001', 'v2.3', 50, 10);

            expect(rate).toBe(0);
        });
    });

    // ────────────────────────────────────────────
    // Gate 5: Quote guard
    // ────────────────────────────────────────────

    describe('Gate 5 — Quote guard', () => {
        it('should REQUIRE_MANUAL when shipment has accepted quote', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue({
                hubId: 'hub-001',
                enabled: true,
                confidenceThreshold: 0.85,
                maxErrorRatePercent: 15,
                lookbackSampleSize: 50,
                errorTolerancePercent: 10,
            } as any);
            vi.spyOn(service, 'computeHistoricalErrorRate').mockResolvedValue(5);
            prismaMock.quote.findFirst.mockResolvedValue({ id: 'quote-1' } as any);

            const result = await service.evaluate(mockScan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('accepted/paid quote');
        });
    });

    // ────────────────────────────────────────────
    // All gates pass
    // ────────────────────────────────────────────

    describe('All gates pass', () => {
        it('should AUTO_VALIDATE when all conditions met', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue({
                hubId: 'hub-001',
                enabled: true,
                confidenceThreshold: 0.85,
                maxErrorRatePercent: 15,
                lookbackSampleSize: 50,
                errorTolerancePercent: 10,
            } as any);
            vi.spyOn(service, 'computeHistoricalErrorRate').mockResolvedValue(5);
            prismaMock.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(mockScan());

            expect(result.decision).toBe('AUTO_VALIDATE');
            expect(result.evidence.contratId).toBe('S1');
            expect(result.evidence.zone).toBe('SAFE');
        });
    });

    // ────────────────────────────────────────────
    // Evidence structure
    // ────────────────────────────────────────────

    describe('Evidence', () => {
        it('should always include complete evidence', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(false);

            const result = await service.evaluate(mockScan());

            expect(result.evidence).toMatchObject({
                contratId: 'S1',
                zone: 'SAFE',
                module: 'SCAN',
                scanResultId: 'scan-001',
                shipmentId: 'ship-001',
                hubId: 'hub-001',
            });
            expect(result.evidence.evaluatedAt).toBeDefined();
        });
    });
});
