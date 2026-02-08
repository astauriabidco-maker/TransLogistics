/**
 * ScanAutoValidationService
 * 
 * Contract S1 — Safe Zone Automation
 * Governs automatic validation of VolumeScan AI results.
 * 
 * Decision flow:
 *   1. Kill switch check (global env + per-hub config)
 *   2. Confidence threshold (per-hub configurable, default 0.85)
 *   3. Historical error rate (recent correction rate below tolerance)
 *   4. Quote guard (no auto-validation if shipment has accepted/paid quote)
 * 
 * Every decision is audit-logged with full explainability.
 */

import type { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { logger } from '../lib/logger';

// ==================================================
// TYPES
// ==================================================

export interface AutoValidationDecision {
    decision: 'AUTO_VALIDATE' | 'REQUIRE_MANUAL';
    reasoning: string;
    evidence: AutoValidationEvidence;
}

export interface AutoValidationEvidence {
    contratId: 'S1';
    zone: 'SAFE';
    module: 'SCAN';
    scanResultId: string;
    shipmentId: string;
    hubId: string | null;
    confidence: number;
    confidenceThreshold: number;
    modelVersion: string;
    globalEnabled: boolean;
    hubEnabled: boolean;
    historicalErrorRate: number | null;
    maxErrorRatePercent: number;
    hasAcceptedQuote: boolean;
    evaluatedAt: string;
}

export interface ScanDataForEvaluation {
    scanResultId: string;
    shipmentId: string;
    hubId: string | null;
    confidenceScore: number;
    modelVersion: string;
}

// ==================================================
// DEFAULTS
// ==================================================

const DEFAULTS = {
    CONFIDENCE_THRESHOLD: 0.85,
    MAX_ERROR_RATE_PERCENT: 15.0,
    LOOKBACK_SAMPLE_SIZE: 50,
    ERROR_TOLERANCE_PERCENT: 10.0,
} as const;

// ==================================================
// SERVICE
// ==================================================

export class ScanAutoValidationService {
    private readonly log = logger.child({ service: 'scan.auto-validation' });

    constructor(private readonly prisma: PrismaClient) { }

    /**
     * Evaluate whether a scan result should be auto-validated.
     * Every call produces an audit log entry.
     */
    async evaluate(scan: ScanDataForEvaluation): Promise<AutoValidationDecision> {
        const globalEnabled = await this.isGlobalEnabled();
        const hubConfig = await this.getHubConfig(scan.hubId);
        const hubEnabled = hubConfig?.enabled ?? false;

        const confidenceThreshold = hubConfig
            ? Number(hubConfig.confidenceThreshold)
            : DEFAULTS.CONFIDENCE_THRESHOLD;
        const maxErrorRate = hubConfig
            ? Number(hubConfig.maxErrorRatePercent)
            : DEFAULTS.MAX_ERROR_RATE_PERCENT;

        // Build base evidence (populated incrementally)
        const evidence: AutoValidationEvidence = {
            contratId: 'S1',
            zone: 'SAFE',
            module: 'SCAN',
            scanResultId: scan.scanResultId,
            shipmentId: scan.shipmentId,
            hubId: scan.hubId,
            confidence: scan.confidenceScore,
            confidenceThreshold,
            modelVersion: scan.modelVersion,
            globalEnabled,
            hubEnabled,
            historicalErrorRate: null,
            maxErrorRatePercent: maxErrorRate,
            hasAcceptedQuote: false,
            evaluatedAt: new Date().toISOString(),
        };

        // ── Gate 1: Global kill switch ──
        if (!globalEnabled) {
            return this.decide('REQUIRE_MANUAL',
                'Auto-validation globally disabled (SCAN_AUTO_VALIDATION_ENABLED != true)',
                evidence);
        }

        // ── Gate 2: Per-hub kill switch ──
        if (!hubEnabled) {
            return this.decide('REQUIRE_MANUAL',
                `Auto-validation disabled for hub ${scan.hubId ?? 'unknown'} (hub config disabled or missing)`,
                evidence);
        }

        // ── Gate 3: Confidence threshold ──
        if (scan.confidenceScore < confidenceThreshold) {
            return this.decide('REQUIRE_MANUAL',
                `Confidence ${scan.confidenceScore.toFixed(4)} below threshold ${confidenceThreshold.toFixed(4)}`,
                evidence);
        }

        // ── Gate 4: Historical error rate ──
        if (scan.hubId && hubConfig) {
            const lookback = hubConfig.lookbackSampleSize ?? DEFAULTS.LOOKBACK_SAMPLE_SIZE;
            const tolerance = Number(hubConfig.errorTolerancePercent ?? DEFAULTS.ERROR_TOLERANCE_PERCENT);
            const errorRate = await this.computeHistoricalErrorRate(
                scan.hubId, scan.modelVersion, lookback, tolerance
            );
            evidence.historicalErrorRate = errorRate;

            if (errorRate > maxErrorRate) {
                return this.decide('REQUIRE_MANUAL',
                    `Historical error rate ${errorRate.toFixed(1)}% exceeds max ${maxErrorRate.toFixed(1)}% ` +
                    `(checked last ${lookback} scans, tolerance ${tolerance}%)`,
                    evidence);
            }
        }

        // ── Gate 5: No override of paid/accepted quotes ──
        const hasAcceptedQuote = await this.hasAcceptedQuoteForShipment(scan.shipmentId);
        evidence.hasAcceptedQuote = hasAcceptedQuote;

        if (hasAcceptedQuote) {
            return this.decide('REQUIRE_MANUAL',
                `Shipment ${scan.shipmentId} has an accepted/paid quote — dimensions cannot be auto-validated`,
                evidence);
        }

        // ── All gates passed ──
        return this.decide('AUTO_VALIDATE',
            `Confidence ${scan.confidenceScore.toFixed(4)} >= ${confidenceThreshold.toFixed(4)}, ` +
            `error rate ${evidence.historicalErrorRate?.toFixed(1) ?? 'N/A'}% <= ${maxErrorRate.toFixed(1)}%, ` +
            `no conflicting quote — auto-validating`,
            evidence);
    }

    // ==================================================
    // INTERNAL: Decision + Audit
    // ==================================================

    private decide(
        decision: 'AUTO_VALIDATE' | 'REQUIRE_MANUAL',
        reasoning: string,
        evidence: AutoValidationEvidence,
    ): AutoValidationDecision {
        const result: AutoValidationDecision = { decision, reasoning, evidence };

        // Structured audit log — immutable, append-only
        this.log.info({
            audit: true,
            contratId: evidence.contratId,
            zone: evidence.zone,
            module: evidence.module,
            action: decision === 'AUTO_VALIDATE' ? 'EXECUTED' : 'SKIPPED',
            decision,
            reasoning,
            scanResultId: evidence.scanResultId,
            shipmentId: evidence.shipmentId,
            hubId: evidence.hubId,
            confidence: evidence.confidence,
            confidenceThreshold: evidence.confidenceThreshold,
            modelVersion: evidence.modelVersion,
            historicalErrorRate: evidence.historicalErrorRate,
            hasAcceptedQuote: evidence.hasAcceptedQuote,
        }, `[S1] Scan auto-validation: ${decision} — ${reasoning}`);

        return result;
    }

    // ==================================================
    // INTERNAL: Kill Switch
    // ==================================================

    async isGlobalEnabled(): Promise<boolean> {
        const config = await this.prisma.automationGlobalConfig.findUnique({
            where: { module: 'SCAN' },
        });
        // If no DB row exists, fall back to env var for backward compat
        if (!config) return process.env['SCAN_AUTO_VALIDATION_ENABLED'] === 'true';
        return config.enabled;
    }

    // ==================================================
    // INTERNAL: Per-Hub Config
    // ==================================================

    async getHubConfig(hubId: string | null) {
        if (!hubId) return null;

        return this.prisma.hubScanAutoValidationConfig.findUnique({
            where: { hubId },
        });
    }

    // ==================================================
    // INTERNAL: Historical Error Rate
    // ==================================================

    /**
     * Compute the % of recent validated scans where the human-corrected
     * dimensions differed from AI-detected dimensions by more than tolerance.
     * 
     * Error = |validated - detected| / detected > tolerancePercent
     * for any of length, width, or height.
     */
    async computeHistoricalErrorRate(
        hubId: string,
        modelVersion: string,
        lookbackSize: number,
        tolerancePercent: number,
    ): Promise<number> {
        // Fetch recent VALIDATED AI scans for this hub & model
        const recentScans = await this.prisma.scanResult.findMany({
            where: {
                hubId,
                modelVersion,
                status: 'VALIDATED',
                source: 'AI',
                validatedAt: { not: null },
                detectedLengthCm: { not: null },
                validatedLengthCm: { not: null },
            },
            orderBy: { validatedAt: 'desc' },
            take: lookbackSize,
            select: {
                detectedLengthCm: true,
                detectedWidthCm: true,
                detectedHeightCm: true,
                validatedLengthCm: true,
                validatedWidthCm: true,
                validatedHeightCm: true,
            },
        });

        if (recentScans.length === 0) {
            // No historical data — allow auto-validation (optimistic)
            return 0;
        }

        const toleranceFraction = tolerancePercent / 100;
        let errorCount = 0;

        for (const scan of recentScans) {
            const detected = {
                l: Number(scan.detectedLengthCm),
                w: Number(scan.detectedWidthCm),
                h: Number(scan.detectedHeightCm),
            };
            const validated = {
                l: Number(scan.validatedLengthCm),
                w: Number(scan.validatedWidthCm),
                h: Number(scan.validatedHeightCm),
            };

            // Check if any dimension deviates beyond tolerance
            const hasError = (
                (detected.l > 0 && Math.abs(validated.l - detected.l) / detected.l > toleranceFraction) ||
                (detected.w > 0 && Math.abs(validated.w - detected.w) / detected.w > toleranceFraction) ||
                (detected.h > 0 && Math.abs(validated.h - detected.h) / detected.h > toleranceFraction)
            );

            if (hasError) errorCount++;
        }

        return (errorCount / recentScans.length) * 100;
    }

    // ==================================================
    // INTERNAL: Quote Guard
    // ==================================================

    /**
     * Check if a shipment already has an accepted or expired (but accepted) quote.
     * If so, dimensions should not be auto-changed.
     */
    private async hasAcceptedQuoteForShipment(shipmentId: string): Promise<boolean> {
        const quote = await this.prisma.quote.findFirst({
            where: {
                shipmentId,
                status: 'ACCEPTED',
            },
            select: { id: true },
        });

        return quote !== null;
    }
}
