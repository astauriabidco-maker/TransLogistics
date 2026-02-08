/**
 * PricingAutoApplicationService
 *
 * Contracts G4/R1 — Guarded/Restricted Zone Automation
 * Governs automatic application of pre-approved pricing recommendations.
 *
 * Decision flow:
 *   1. Global kill switch (PRICING_AUTO_APPLICATION_ENABLED env)
 *   2. Per-route opt-in (RoutePricingAutoConfig.enabled)
 *   3. Bounds check (each price field change within approved %)
 *   4. Route stability (RoutePerformanceSnapshot consistency)
 *   5. Risk signal detection (margin decline, refund spikes)
 *   6. Per-period limit (max N auto-applications per month)
 *
 * Every decision is audit-logged with full explainability.
 */

import type { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// TYPES
// ==================================================

export interface PricingRecommendation {
    routeId: string;
    recommendedBasePriceXof: number;
    recommendedPricePerKg: number;
    recommendedPricePerCm3: number;
    minimumPriceXof?: number;
    reasoning: string;
    sourceModel: string;
    generatedAt: Date;
}

export interface PricingAutoApplicationDecision {
    decision: 'APPLY' | 'REJECT';
    reasoning: string;
    simulation: PricingSimulationResult | null;
    evidence: PricingAutoApplicationEvidence;
}

export interface PricingSimulationResult {
    currentRule: PricingRuleSnapshot;
    proposedRule: PricingRuleSnapshot;
    changes: PricingFieldChange[];
}

export interface PricingRuleSnapshot {
    basePriceXof: number;
    pricePerKg: number;
    pricePerCm3: number;
    minimumPriceXof: number;
}

export interface PricingFieldChange {
    field: string;
    currentValue: number;
    proposedValue: number;
    changePercent: number;
    maxAllowedPercent: number;
    withinBounds: boolean;
}

export interface PricingAutoApplicationEvidence {
    contratId: 'G4' | 'R1';
    zone: 'GUARDED' | 'RESTRICTED';
    module: 'PRICING';
    routeId: string;
    sourceModel: string;
    globalEnabled: boolean;
    routeEnabled: boolean;
    boundsCheckPassed: boolean;
    stabilityCheckPassed: boolean | null;
    riskCheckPassed: boolean | null;
    periodLimitPassed: boolean | null;
    applicationsThisMonth: number;
    maxApplicationsPerMonth: number;
    evaluatedAt: string;
}

// ==================================================
// DEFAULTS
// ==================================================

const DEFAULTS = {
    MAX_BASE_PRICE_CHANGE_PERCENT: 10.0,
    MAX_PRICE_PER_KG_CHANGE_PERCENT: 15.0,
    MAX_PRICE_PER_CM3_CHANGE_PERCENT: 15.0,
    MAX_APPLICATIONS_PER_MONTH: 2,
    MIN_STABLE_DAYS: 14,
    STABILITY_MARGIN_VARIANCE_MAX: 20.0,   // max % variance in margin over window
    RISK_MARGIN_DECLINE_THRESHOLD: -10.0,   // reject if margin dropped > 10% over window
    RISK_REFUND_SPIKE_THRESHOLD: 5.0,       // reject if refunds exceed 5% of revenue
} as const;

// ==================================================
// SERVICE
// ==================================================

export class PricingAutoApplicationService {
    private readonly log = logger.child({ service: 'pricing.auto-application' });

    constructor(private readonly prisma: PrismaClient) { }

    /**
     * Evaluate whether a pricing recommendation should be auto-applied.
     * Default is simulation-only (dry-run).
     */
    async evaluate(recommendation: PricingRecommendation): Promise<PricingAutoApplicationDecision> {
        const globalEnabled = await this.isGlobalEnabled();
        const routeConfig = await this.getRouteConfig(recommendation.routeId);
        const routeEnabled = routeConfig?.enabled ?? false;

        const maxApps = routeConfig?.maxApplicationsPerMonth ?? DEFAULTS.MAX_APPLICATIONS_PER_MONTH;

        // Build base evidence
        const evidence: PricingAutoApplicationEvidence = {
            contratId: 'G4',
            zone: 'GUARDED',
            module: 'PRICING',
            routeId: recommendation.routeId,
            sourceModel: recommendation.sourceModel,
            globalEnabled,
            routeEnabled,
            boundsCheckPassed: false,
            stabilityCheckPassed: null,
            riskCheckPassed: null,
            periodLimitPassed: null,
            applicationsThisMonth: 0,
            maxApplicationsPerMonth: maxApps,
            evaluatedAt: new Date().toISOString(),
        };

        // ── Gate 1: Global kill switch ──
        if (!globalEnabled) {
            return this.decide('REJECT',
                'Pricing auto-application globally disabled (PRICING_AUTO_APPLICATION_ENABLED != true)',
                null, evidence);
        }

        // ── Gate 2: Per-route opt-in ──
        if (!routeEnabled) {
            return this.decide('REJECT',
                `Route ${recommendation.routeId} not opted-in for pricing auto-application`,
                null, evidence);
        }

        // ── Gate 3: Bounds check ──
        const currentRule = await this.getCurrentActiveRule(recommendation.routeId);
        if (!currentRule) {
            return this.decide('REJECT',
                `No active pricing rule for route ${recommendation.routeId} — cannot compare bounds`,
                null, evidence);
        }

        const simulation = this.computeSimulation(currentRule, recommendation, routeConfig!);
        const allWithinBounds = simulation.changes.every(c => c.withinBounds);
        evidence.boundsCheckPassed = allWithinBounds;

        if (!allWithinBounds) {
            const violations = simulation.changes
                .filter(c => !c.withinBounds)
                .map(c => `${c.field}: ${c.changePercent.toFixed(1)}% (max ${c.maxAllowedPercent.toFixed(1)}%)`)
                .join(', ');
            return this.decide('REJECT',
                `Price changes exceed approved bounds: ${violations}`,
                simulation, evidence);
        }

        // ── Gate 4: Route stability ──
        const minStableDays = routeConfig?.minStableDays ?? DEFAULTS.MIN_STABLE_DAYS;
        const stabilityResult = await this.checkRouteStability(recommendation.routeId, minStableDays);
        evidence.stabilityCheckPassed = stabilityResult.stable;

        if (!stabilityResult.stable) {
            return this.decide('REJECT',
                `Route ${recommendation.routeId} unstable: ${stabilityResult.reason}`,
                simulation, evidence);
        }

        // ── Gate 5: Risk signals ──
        const riskResult = await this.checkRiskSignals(recommendation.routeId, minStableDays);
        evidence.riskCheckPassed = riskResult.safe;

        if (!riskResult.safe) {
            return this.decide('REJECT',
                `Active risk signal on route ${recommendation.routeId}: ${riskResult.reason}`,
                simulation, evidence);
        }

        // ── Gate 6: Per-period limit ──
        const applicationsThisMonth = await this.countApplicationsThisMonth(recommendation.routeId);
        evidence.applicationsThisMonth = applicationsThisMonth;
        evidence.periodLimitPassed = applicationsThisMonth < maxApps;

        if (applicationsThisMonth >= maxApps) {
            return this.decide('REJECT',
                `Route ${recommendation.routeId} reached monthly limit: ${applicationsThisMonth}/${maxApps} applications`,
                simulation, evidence);
        }

        // ── All gates passed — promote to Restricted zone for application ──
        evidence.contratId = 'R1';
        evidence.zone = 'RESTRICTED';

        return this.decide('APPLY',
            `All gates passed — recommendation within bounds (${simulation.changes.map(
                c => `${c.field}: ${c.changePercent >= 0 ? '+' : ''}${c.changePercent.toFixed(1)}%`
            ).join(', ')}), route stable, no risk signals, ${applicationsThisMonth}/${maxApps} monthly limit`,
            simulation, evidence);
    }

    /**
     * Apply a recommendation: create + activate a new PricingRule version.
     * Should only be called after evaluate() returns APPLY.
     */
    async apply(
        recommendation: PricingRecommendation,
        ctx: { userId?: string; requestId: string },
    ): Promise<{ newRuleId: string; newVersion: number; previousRuleId: string }> {
        const currentRule = await this.getCurrentActiveRule(recommendation.routeId);
        if (!currentRule) {
            throw new Error(`No active pricing rule for route ${recommendation.routeId}`);
        }

        // Get next version
        const latestRule = await this.prisma.pricingRule.findFirst({
            where: { routeId: recommendation.routeId },
            orderBy: { version: 'desc' },
        });
        const nextVersion = (latestRule?.version ?? 0) + 1;

        // Transaction: create new rule as DRAFT, then activate (which supersedes old)
        const [newRule] = await this.prisma.$transaction([
            // Create new rule
            this.prisma.pricingRule.create({
                data: {
                    routeId: recommendation.routeId,
                    version: nextVersion,
                    status: 'DRAFT',
                    basePriceXof: recommendation.recommendedBasePriceXof,
                    pricePerKg: recommendation.recommendedPricePerKg,
                    pricePerCm3: recommendation.recommendedPricePerCm3,
                    minimumPriceXof: recommendation.minimumPriceXof ?? Number(currentRule.minimumPriceXof),
                    maximumWeightKg: Number(currentRule.maximumWeightKg),
                    effectiveFrom: new Date(),
                    createdById: 'pricing-auto-application',
                },
            }),
            // Supersede current active rule
            this.prisma.pricingRule.update({
                where: { id: currentRule.id },
                data: {
                    status: 'SUPERSEDED',
                    effectiveTo: new Date(),
                },
            }),
        ]);

        // Activate the new rule
        await this.prisma.pricingRule.update({
            where: { id: newRule.id },
            data: { status: 'ACTIVE' },
        });

        this.log.info({
            audit: true,
            contratId: 'R1',
            zone: 'RESTRICTED',
            module: 'PRICING',
            action: 'APPLIED',
            routeId: recommendation.routeId,
            previousRuleId: currentRule.id,
            previousVersion: currentRule.version,
            newRuleId: newRule.id,
            newVersion: nextVersion,
            sourceModel: recommendation.sourceModel,
            reasoning: recommendation.reasoning,
            changes: {
                basePriceXof: { from: Number(currentRule.basePriceXof), to: recommendation.recommendedBasePriceXof },
                pricePerKg: { from: Number(currentRule.pricePerKg), to: recommendation.recommendedPricePerKg },
                pricePerCm3: { from: Number(currentRule.pricePerCm3), to: recommendation.recommendedPricePerCm3 },
            },
        }, `[R1] Pricing auto-applied: route ${recommendation.routeId} v${currentRule.version} → v${nextVersion}`);

        return {
            newRuleId: newRule.id,
            newVersion: nextVersion,
            previousRuleId: currentRule.id,
        };
    }

    /**
     * Rollback: revert to the previous version by re-activating the SUPERSEDED rule.
     */
    async rollback(
        routeId: string,
        ctx: { userId?: string; requestId: string },
    ): Promise<{ restoredRuleId: string; rolledBackRuleId: string }> {
        // Find the auto-applied rule (current ACTIVE created by us)
        const autoAppliedRule = await this.prisma.pricingRule.findFirst({
            where: {
                routeId,
                status: 'ACTIVE',
                createdById: 'pricing-auto-application',
            },
            orderBy: { version: 'desc' },
        });

        if (!autoAppliedRule) {
            throw new Error(`No auto-applied active rule found for route ${routeId}`);
        }

        // Find the previous rule (SUPERSEDED, one version below)
        const previousRule = await this.prisma.pricingRule.findFirst({
            where: {
                routeId,
                status: 'SUPERSEDED',
                version: { lt: autoAppliedRule.version },
            },
            orderBy: { version: 'desc' },
        });

        if (!previousRule) {
            throw new Error(`No previous rule found to restore for route ${routeId}`);
        }

        // Transaction: supersede auto-applied, reactivate previous
        await this.prisma.$transaction([
            this.prisma.pricingRule.update({
                where: { id: autoAppliedRule.id },
                data: { status: 'SUPERSEDED', effectiveTo: new Date() },
            }),
            this.prisma.pricingRule.update({
                where: { id: previousRule.id },
                data: { status: 'ACTIVE', effectiveTo: null },
            }),
        ]);

        this.log.info({
            audit: true,
            contratId: 'R1',
            zone: 'RESTRICTED',
            module: 'PRICING',
            action: 'ROLLED_BACK',
            routeId,
            rolledBackRuleId: autoAppliedRule.id,
            rolledBackVersion: autoAppliedRule.version,
            restoredRuleId: previousRule.id,
            restoredVersion: previousRule.version,
            requestedBy: ctx.userId,
        }, `[R1] Pricing rollback: route ${routeId} v${autoAppliedRule.version} → v${previousRule.version}`);

        return {
            restoredRuleId: previousRule.id,
            rolledBackRuleId: autoAppliedRule.id,
        };
    }

    // ==================================================
    // INTERNAL: Decision + Audit
    // ==================================================

    private decide(
        decision: 'APPLY' | 'REJECT',
        reasoning: string,
        simulation: PricingSimulationResult | null,
        evidence: PricingAutoApplicationEvidence,
    ): PricingAutoApplicationDecision {
        const result: PricingAutoApplicationDecision = { decision, reasoning, simulation, evidence };

        this.log.info({
            audit: true,
            contratId: evidence.contratId,
            zone: evidence.zone,
            module: evidence.module,
            action: decision === 'APPLY' ? 'APPROVED' : 'REJECTED',
            decision,
            reasoning,
            routeId: evidence.routeId,
            sourceModel: evidence.sourceModel,
            boundsCheckPassed: evidence.boundsCheckPassed,
            stabilityCheckPassed: evidence.stabilityCheckPassed,
            riskCheckPassed: evidence.riskCheckPassed,
            periodLimitPassed: evidence.periodLimitPassed,
            applicationsThisMonth: evidence.applicationsThisMonth,
        }, `[${evidence.contratId}] Pricing auto-application: ${decision} — ${reasoning}`);

        return result;
    }

    // ==================================================
    // INTERNAL: Kill Switch
    // ==================================================

    async isGlobalEnabled(): Promise<boolean> {
        const config = await this.prisma.automationGlobalConfig.findUnique({
            where: { module: 'PRICING' },
        });
        if (!config) return process.env['PRICING_AUTO_APPLICATION_ENABLED'] === 'true';
        return config.enabled;
    }

    // ==================================================
    // INTERNAL: Route Config
    // ==================================================

    async getRouteConfig(routeId: string) {
        return this.prisma.routePricingAutoConfig.findUnique({
            where: { routeId },
        });
    }

    // ==================================================
    // INTERNAL: Current Active Rule
    // ==================================================

    private async getCurrentActiveRule(routeId: string) {
        return this.prisma.pricingRule.findFirst({
            where: { routeId, status: 'ACTIVE' },
            orderBy: { version: 'desc' },
        });
    }

    // ==================================================
    // INTERNAL: Simulation (Bounds Check)
    // ==================================================

    private computeSimulation(
        currentRule: { basePriceXof: unknown; pricePerKg: unknown; pricePerCm3: unknown; minimumPriceXof: unknown },
        recommendation: PricingRecommendation,
        config: { maxBasePriceChangePercent: unknown; maxPricePerKgChangePercent: unknown; maxPricePerCm3ChangePercent: unknown },
    ): PricingSimulationResult {
        const current: PricingRuleSnapshot = {
            basePriceXof: Number(currentRule.basePriceXof),
            pricePerKg: Number(currentRule.pricePerKg),
            pricePerCm3: Number(currentRule.pricePerCm3),
            minimumPriceXof: Number(currentRule.minimumPriceXof),
        };

        const proposed: PricingRuleSnapshot = {
            basePriceXof: recommendation.recommendedBasePriceXof,
            pricePerKg: recommendation.recommendedPricePerKg,
            pricePerCm3: recommendation.recommendedPricePerCm3,
            minimumPriceXof: recommendation.minimumPriceXof ?? current.minimumPriceXof,
        };

        const changes: PricingFieldChange[] = [
            this.computeFieldChange('basePriceXof', current.basePriceXof, proposed.basePriceXof,
                Number(config.maxBasePriceChangePercent)),
            this.computeFieldChange('pricePerKg', current.pricePerKg, proposed.pricePerKg,
                Number(config.maxPricePerKgChangePercent)),
            this.computeFieldChange('pricePerCm3', current.pricePerCm3, proposed.pricePerCm3,
                Number(config.maxPricePerCm3ChangePercent)),
        ];

        return { currentRule: current, proposedRule: proposed, changes };
    }

    private computeFieldChange(
        field: string,
        currentValue: number,
        proposedValue: number,
        maxAllowedPercent: number,
    ): PricingFieldChange {
        const changePercent = currentValue > 0
            ? ((proposedValue - currentValue) / currentValue) * 100
            : proposedValue === 0 ? 0 : 100;

        return {
            field,
            currentValue,
            proposedValue,
            changePercent,
            maxAllowedPercent,
            withinBounds: Math.abs(changePercent) <= maxAllowedPercent,
        };
    }

    // ==================================================
    // INTERNAL: Route Stability
    // ==================================================

    /**
     * Check that the route has consistent performance over the stability window.
     * Requirements:
     * - Enough data (minDays of snapshots)
     * - Margin variance within threshold
     * - Non-zero shipment volume
     */
    async checkRouteStability(
        routeId: string,
        minDays: number,
    ): Promise<{ stable: boolean; reason: string }> {
        const since = new Date();
        since.setDate(since.getDate() - minDays);

        const snapshots = await this.prisma.routePerformanceSnapshot.findMany({
            where: {
                routeId,
                periodDay: { gte: since },
            },
            orderBy: { periodDay: 'asc' },
            select: {
                shipmentCount: true,
                marginPercent: true,
                netRevenueXof: true,
            },
        });

        // Not enough data → conservative rejection
        if (snapshots.length < Math.min(minDays, 7)) {
            return { stable: false, reason: `Insufficient data: ${snapshots.length} snapshots (need ${Math.min(minDays, 7)})` };
        }

        // Check for zero-volume periods
        const zeroVolumeDays = snapshots.filter(s => s.shipmentCount === 0).length;
        if (zeroVolumeDays > snapshots.length * 0.3) {
            return { stable: false, reason: `${zeroVolumeDays}/${snapshots.length} days with zero shipments` };
        }

        // Margin variance check
        const margins = snapshots.map(s => Number(s.marginPercent));
        const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.reduce((sum, m) => sum + Math.pow(m - avgMargin, 2), 0) / margins.length;
        const stdDev = Math.sqrt(variance);
        const coeffOfVariation = avgMargin !== 0 ? (stdDev / Math.abs(avgMargin)) * 100 : 0;

        if (coeffOfVariation > DEFAULTS.STABILITY_MARGIN_VARIANCE_MAX) {
            return {
                stable: false,
                reason: `Margin too volatile: CV=${coeffOfVariation.toFixed(1)}% (max ${DEFAULTS.STABILITY_MARGIN_VARIANCE_MAX}%)`,
            };
        }

        return { stable: true, reason: 'Route performance is stable' };
    }

    // ==================================================
    // INTERNAL: Risk Signal Detection
    // ==================================================

    /**
     * Check for active risk signals:
     * - Declining margin trend
     * - Refund spike
     */
    async checkRiskSignals(
        routeId: string,
        windowDays: number,
    ): Promise<{ safe: boolean; reason: string }> {
        const since = new Date();
        since.setDate(since.getDate() - windowDays);

        const snapshots = await this.prisma.routePerformanceSnapshot.findMany({
            where: {
                routeId,
                periodDay: { gte: since },
            },
            orderBy: { periodDay: 'asc' },
            select: {
                marginPercent: true,
                netRevenueXof: true,
                refundsXof: true,
                revenueXof: true,
                periodDay: true,
            },
        });

        if (snapshots.length < 2) {
            return { safe: true, reason: 'Insufficient data for risk assessment — no signal' };
        }

        // Margin trend: compare first half vs second half
        const midpoint = Math.floor(snapshots.length / 2);
        const firstHalf = snapshots.slice(0, midpoint);
        const secondHalf = snapshots.slice(midpoint);

        const avgMarginFirst = firstHalf.reduce((a, s) => a + Number(s.marginPercent), 0) / firstHalf.length;
        const avgMarginSecond = secondHalf.reduce((a, s) => a + Number(s.marginPercent), 0) / secondHalf.length;
        const marginDelta = avgMarginSecond - avgMarginFirst;

        if (marginDelta < DEFAULTS.RISK_MARGIN_DECLINE_THRESHOLD) {
            return {
                safe: false,
                reason: `Margin declining: ${avgMarginFirst.toFixed(1)}% → ${avgMarginSecond.toFixed(1)}% (delta: ${marginDelta.toFixed(1)}%)`,
            };
        }

        // Refund spike: check if total refunds exceed threshold %
        const totalRevenue = snapshots.reduce((a, s) => a + Number(s.revenueXof), 0);
        const totalRefunds = snapshots.reduce((a, s) => a + Number(s.refundsXof), 0);
        const refundRate = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;

        if (refundRate > DEFAULTS.RISK_REFUND_SPIKE_THRESHOLD) {
            return {
                safe: false,
                reason: `Refund spike: ${refundRate.toFixed(1)}% of revenue (threshold: ${DEFAULTS.RISK_REFUND_SPIKE_THRESHOLD}%)`,
            };
        }

        return { safe: true, reason: 'No active risk signals' };
    }

    // ==================================================
    // INTERNAL: Period Limit
    // ==================================================

    /**
     * Count how many auto-applications happened this month for a route.
     */
    async countApplicationsThisMonth(routeId: string): Promise<number> {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        return this.prisma.pricingRule.count({
            where: {
                routeId,
                createdById: 'pricing-auto-application',
                createdAt: { gte: startOfMonth },
            },
        });
    }
}
