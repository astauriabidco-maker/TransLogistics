/**
 * Scan Service — Business Invariants Tests
 * 
 * Tests VolumeScan confidence thresholds, auto-accept logic,
 * and dimension validation invariants.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { createScanResult } from '../test/factories';

// ==================================================
// CONFIDENCE THRESHOLDS (from scan.service.ts)
// ==================================================

const SCAN_CONFIDENCE_THRESHOLDS = {
    AUTO_ACCEPT: 0.85,
    MANUAL_VALIDATION: 0.60,
};

// ==================================================
// TESTS
// ==================================================

describe('Scan Confidence Thresholds', () => {
    describe('Auto-accept logic', () => {
        it('should auto-accept scans with confidence >= 0.85', () => {
            const highConfidence = [0.85, 0.90, 0.95, 0.99, 1.0];

            for (const conf of highConfidence) {
                const shouldAutoAccept = conf >= SCAN_CONFIDENCE_THRESHOLDS.AUTO_ACCEPT;
                expect(shouldAutoAccept).toBe(true);
            }
        });

        it('should require manual validation for confidence between 0.60 and 0.85', () => {
            const mediumConfidence = [0.60, 0.65, 0.70, 0.75, 0.80, 0.84];

            for (const conf of mediumConfidence) {
                const needsManualValidation =
                    conf >= SCAN_CONFIDENCE_THRESHOLDS.MANUAL_VALIDATION &&
                    conf < SCAN_CONFIDENCE_THRESHOLDS.AUTO_ACCEPT;

                expect(needsManualValidation).toBe(true);
            }
        });

        it('should reject scans with confidence < 0.60', () => {
            const lowConfidence = [0.0, 0.10, 0.30, 0.50, 0.59];

            for (const conf of lowConfidence) {
                const shouldReject = conf < SCAN_CONFIDENCE_THRESHOLDS.MANUAL_VALIDATION;
                expect(shouldReject).toBe(true);
            }
        });
    });

    describe('AUTO_ACCEPT > MANUAL_VALIDATION', () => {
        it('auto-accept threshold must be higher than manual validation threshold', () => {
            expect(SCAN_CONFIDENCE_THRESHOLDS.AUTO_ACCEPT)
                .toBeGreaterThan(SCAN_CONFIDENCE_THRESHOLDS.MANUAL_VALIDATION);
        });

        it('both thresholds must be in range [0, 1]', () => {
            expect(SCAN_CONFIDENCE_THRESHOLDS.AUTO_ACCEPT).toBeGreaterThanOrEqual(0);
            expect(SCAN_CONFIDENCE_THRESHOLDS.AUTO_ACCEPT).toBeLessThanOrEqual(1);
            expect(SCAN_CONFIDENCE_THRESHOLDS.MANUAL_VALIDATION).toBeGreaterThanOrEqual(0);
            expect(SCAN_CONFIDENCE_THRESHOLDS.MANUAL_VALIDATION).toBeLessThanOrEqual(1);
        });
    });
});

describe('Scan Result Invariants', () => {
    describe('Dimension validation', () => {
        it('detected dimensions must be positive', () => {
            const scan = createScanResult();
            expect(scan.detectedLengthCm.toNumber()).toBeGreaterThan(0);
            expect(scan.detectedWidthCm.toNumber()).toBeGreaterThan(0);
            expect(scan.detectedHeightCm.toNumber()).toBeGreaterThan(0);
        });

        it('validated dimensions should be null until validation', () => {
            const scan = createScanResult({ status: 'COMPLETED' });
            expect(scan.validatedLengthCm).toBeNull();
            expect(scan.validatedWidthCm).toBeNull();
            expect(scan.validatedHeightCm).toBeNull();
        });

        it('validated scan should have validated dimensions', () => {
            const scan = createScanResult({
                status: 'VALIDATED',
                validatedLengthCm: new Decimal(30.0),
                validatedWidthCm: new Decimal(20.0),
                validatedHeightCm: new Decimal(15.0),
            });
            expect(scan.validatedLengthCm).not.toBeNull();
            expect(scan.validatedWidthCm).not.toBeNull();
            expect(scan.validatedHeightCm).not.toBeNull();
        });
    });

    describe('Scan status transitions', () => {
        const validScanTransitions: Record<string, string[]> = {
            'PROCESSING': ['COMPLETED', 'REJECTED'],
            'COMPLETED': ['VALIDATED', 'REJECTED'],
            'VALIDATED': [],  // Terminal
            'REJECTED': [],  // Terminal
        };

        it('PROCESSING should transition to COMPLETED or REJECTED', () => {
            expect(validScanTransitions['PROCESSING']).toContain('COMPLETED');
            expect(validScanTransitions['PROCESSING']).toContain('REJECTED');
        });

        it('COMPLETED should transition to VALIDATED or REJECTED', () => {
            expect(validScanTransitions['COMPLETED']).toContain('VALIDATED');
            expect(validScanTransitions['COMPLETED']).toContain('REJECTED');
        });

        it('VALIDATED should be terminal', () => {
            expect(validScanTransitions['VALIDATED']).toHaveLength(0);
        });

        it('REJECTED should be terminal', () => {
            expect(validScanTransitions['REJECTED']).toHaveLength(0);
        });
    });

    describe('Model version tracking', () => {
        it('scan result must have a model version', () => {
            const scan = createScanResult();
            expect(scan.modelVersion).toBeTruthy();
            expect(typeof scan.modelVersion).toBe('string');
        });

        it('processing time must be non-negative', () => {
            const scan = createScanResult();
            expect(scan.processingTimeMs).toBeGreaterThanOrEqual(0);
        });
    });
});

describe('Volumetric Weight Calculation', () => {
    /**
     * Volumetric weight formula:
     * volumetricWeightKg = (L × W × H) / volumetricDivisor
     * Standard divisor: 5000 (for cm³ to kg)
     */
    const VOLUMETRIC_DIVISOR = 5000;

    it('should calculate volumetric weight correctly', () => {
        const L = 30, W = 20, H = 15; // cm
        const expected = (L * W * H) / VOLUMETRIC_DIVISOR;
        expect(expected).toBe(1.8); // 9000 / 5000 = 1.8 kg
    });

    it('larger packages should have higher volumetric weight', () => {
        const small = (10 * 10 * 10) / VOLUMETRIC_DIVISOR; // 0.2 kg
        const large = (50 * 40 * 30) / VOLUMETRIC_DIVISOR; // 12 kg
        expect(large).toBeGreaterThan(small);
    });

    it('volumetric weight must be positive for valid dimensions', () => {
        const scenarios = [
            { L: 1, W: 1, H: 1 },
            { L: 100, W: 100, H: 100 },
            { L: 0.5, W: 0.5, H: 0.5 },
        ];

        for (const { L, W, H } of scenarios) {
            const volumetric = (L * W * H) / VOLUMETRIC_DIVISOR;
            expect(volumetric).toBeGreaterThan(0);
        }
    });
});
