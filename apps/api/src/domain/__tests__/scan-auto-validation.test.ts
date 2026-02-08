/**
 * Scan Auto-Validation — Governance Tests
 *
 * Tests the ScanAutoValidationService (Contract S1 — Safe Zone).
 * Validates kill switches, confidence thresholds, error rates,
 * quote guards, and audit logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanAutoValidationService } from '../../services/scan-auto-validation.service';
import type { ScanDataForEvaluation } from '../../services/scan-auto-validation.service';

// ==================================================
// MOCK PRISMA
// ==================================================

function createMockPrisma() {
    return {
        hubScanAutoValidationConfig: {
            findUnique: vi.fn().mockResolvedValue(null),
        },
        scanResult: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        quote: {
            findFirst: vi.fn().mockResolvedValue(null),
        },
    } as any;
}

// ==================================================
// HELPERS
// ==================================================

function makeScanData(overrides: Partial<ScanDataForEvaluation> = {}): ScanDataForEvaluation {
    return {
        scanResultId: 'scan-001',
        shipmentId: 'ship-001',
        hubId: 'hub-abj',
        confidenceScore: 0.92,
        modelVersion: 'volumescan-v1.0.0',
        ...overrides,
    };
}

function makeHubConfig(overrides: Record<string, unknown> = {}) {
    return {
        id: 'cfg-001',
        hubId: 'hub-abj',
        enabled: true,
        confidenceThreshold: 0.85,
        maxErrorRatePercent: 15.0,
        lookbackSampleSize: 50,
        errorTolerancePercent: 10.0,
        updatedAt: new Date(),
        updatedByUserId: 'admin-1',
        ...overrides,
    };
}

// ==================================================
// TESTS
// ==================================================

describe('ScanAutoValidationService', () => {
    let service: ScanAutoValidationService;
    let prisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
        prisma = createMockPrisma();
        service = new ScanAutoValidationService(prisma);
        // Default: global enabled
        process.env['SCAN_AUTO_VALIDATION_ENABLED'] = 'true';
    });

    afterEach(() => {
        delete process.env['SCAN_AUTO_VALIDATION_ENABLED'];
        vi.restoreAllMocks();
    });

    // --------------------------------------------------
    // Gate 1: Global Kill Switch
    // --------------------------------------------------

    describe('Global Kill Switch', () => {
        it('should REQUIRE_MANUAL when global switch is OFF', async () => {
            process.env['SCAN_AUTO_VALIDATION_ENABLED'] = 'false';
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('globally disabled');
            expect(result.evidence.globalEnabled).toBe(false);
        });

        it('should REQUIRE_MANUAL when env var is missing', async () => {
            delete process.env['SCAN_AUTO_VALIDATION_ENABLED'];
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.evidence.globalEnabled).toBe(false);
        });
    });

    // --------------------------------------------------
    // Gate 2: Per-Hub Kill Switch
    // --------------------------------------------------

    describe('Per-Hub Kill Switch', () => {
        it('should REQUIRE_MANUAL when hub config is disabled', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(
                makeHubConfig({ enabled: false })
            );

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('disabled for hub');
            expect(result.evidence.hubEnabled).toBe(false);
        });

        it('should REQUIRE_MANUAL when hub config does not exist', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('hub config disabled or missing');
        });

        it('should REQUIRE_MANUAL when hubId is null', async () => {
            const result = await service.evaluate(makeScanData({ hubId: null }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('hub');
        });
    });

    // --------------------------------------------------
    // Gate 3: Confidence Threshold
    // --------------------------------------------------

    describe('Confidence Threshold', () => {
        it('should REQUIRE_MANUAL when confidence is below threshold', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());

            const result = await service.evaluate(makeScanData({ confidenceScore: 0.70 }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('below threshold');
            expect(result.evidence.confidence).toBe(0.70);
            expect(result.evidence.confidenceThreshold).toBe(0.85);
        });

        it('should pass gate when confidence equals threshold', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.scanResult.findMany.mockResolvedValue([]); // no historical data
            prisma.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData({ confidenceScore: 0.85 }));

            // Should pass confidence gate (may still auto-validate if other gates pass)
            expect(result.decision).toBe('AUTO_VALIDATE');
        });

        it('should respect custom hub threshold', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(
                makeHubConfig({
                    confidenceThreshold: 0.95,
                })
            );

            const result = await service.evaluate(makeScanData({ confidenceScore: 0.92 }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('below threshold');
            expect(result.evidence.confidenceThreshold).toBe(0.95);
        });
    });

    // --------------------------------------------------
    // Gate 4: Historical Error Rate
    // --------------------------------------------------

    describe('Historical Error Rate', () => {
        it('should REQUIRE_MANUAL when error rate exceeds threshold', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());

            // 10 recent scans, 3 with > 10% deviation = 30% error rate
            const recentScans = Array.from({ length: 10 }, (_, i) => ({
                detectedLengthCm: 30,
                detectedWidthCm: 20,
                detectedHeightCm: 15,
                validatedLengthCm: i < 3 ? 40 : 30,  // 3 scans with 33% error on length
                validatedWidthCm: 20,
                validatedHeightCm: 15,
            }));
            prisma.scanResult.findMany.mockResolvedValue(recentScans);

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('error rate');
            expect(result.evidence.historicalErrorRate).toBe(30);
        });

        it('should AUTO_VALIDATE when error rate is within threshold', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());

            // 10 scans, 1 with error = 10% error rate (below 15% max)
            const recentScans = Array.from({ length: 10 }, (_, i) => ({
                detectedLengthCm: 30,
                detectedWidthCm: 20,
                detectedHeightCm: 15,
                validatedLengthCm: i < 1 ? 40 : 30,
                validatedWidthCm: 20,
                validatedHeightCm: 15,
            }));
            prisma.scanResult.findMany.mockResolvedValue(recentScans);
            prisma.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('AUTO_VALIDATE');
            expect(result.evidence.historicalErrorRate).toBe(10);
        });

        it('should AUTO_VALIDATE when no historical data exists (optimistic)', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.scanResult.findMany.mockResolvedValue([]);
            prisma.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('AUTO_VALIDATE');
            expect(result.evidence.historicalErrorRate).toBe(0);
        });
    });

    // --------------------------------------------------
    // Gate 5: Quote Guard
    // --------------------------------------------------

    describe('Quote Guard', () => {
        it('should REQUIRE_MANUAL when shipment has accepted quote', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.scanResult.findMany.mockResolvedValue([]);
            prisma.quote.findFirst.mockResolvedValue({ id: 'quote-001' });

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('accepted/paid quote');
            expect(result.evidence.hasAcceptedQuote).toBe(true);
        });

        it('should AUTO_VALIDATE when shipment has no accepted quote', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.scanResult.findMany.mockResolvedValue([]);
            prisma.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('AUTO_VALIDATE');
            expect(result.evidence.hasAcceptedQuote).toBe(false);
        });
    });

    // --------------------------------------------------
    // Audit Evidence
    // --------------------------------------------------

    describe('Audit Evidence', () => {
        it('should always include contract S1 metadata', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.scanResult.findMany.mockResolvedValue([]);
            prisma.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData());

            expect(result.evidence.contratId).toBe('S1');
            expect(result.evidence.zone).toBe('SAFE');
            expect(result.evidence.module).toBe('SCAN');
        });

        it('should include model version and timestamp', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.scanResult.findMany.mockResolvedValue([]);
            prisma.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData());

            expect(result.evidence.modelVersion).toBe('volumescan-v1.0.0');
            expect(result.evidence.evaluatedAt).toBeTruthy();
        });

        it('should include all gate results in evidence', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.scanResult.findMany.mockResolvedValue([]);
            prisma.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData());

            expect(result.evidence).toMatchObject({
                globalEnabled: true,
                hubEnabled: true,
                confidence: 0.92,
                confidenceThreshold: 0.85,
                historicalErrorRate: 0,
                maxErrorRatePercent: 15,
                hasAcceptedQuote: false,
            });
        });
    });

    // --------------------------------------------------
    // Full Happy Path
    // --------------------------------------------------

    describe('Happy Path', () => {
        it('should AUTO_VALIDATE with all conditions met', async () => {
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.scanResult.findMany.mockResolvedValue([]);
            prisma.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData({
                confidenceScore: 0.95,
            }));

            expect(result.decision).toBe('AUTO_VALIDATE');
            expect(result.reasoning).toContain('auto-validating');
            expect(result.evidence.confidence).toBe(0.95);
        });
    });

    // --------------------------------------------------
    // Reversibility
    // --------------------------------------------------

    describe('Reversibility', () => {
        it('auto-validated scans use identifiable validatedById', async () => {
            // This is verified at integration level (ScanService sets validatedById: 'ai-auto-validation')
            // Here we just verify the decision output is clean
            prisma.hubScanAutoValidationConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.scanResult.findMany.mockResolvedValue([]);
            prisma.quote.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeScanData());

            expect(result.decision).toBe('AUTO_VALIDATE');
            // Rollback can query: WHERE validatedById = 'ai-auto-validation'
        });
    });
});
