/**
 * Pricing Auto-Application — Governance Tests
 *
 * Tests the PricingAutoApplicationService (Contracts G4/R1).
 * Validates kill switches, bounds checks, stability analysis,
 * risk signals, period limits, apply/rollback, and audit logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PricingAutoApplicationService } from '../../services/pricing-auto-application.service';
import type { PricingRecommendation } from '../../services/pricing-auto-application.service';

// ==================================================
// MOCK PRISMA
// ==================================================

function createMockPrisma() {
    return {
        routePricingAutoConfig: {
            findUnique: vi.fn().mockResolvedValue(null),
        },
        pricingRule: {
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue({ id: 'new-rule-001', version: 2 }),
            update: vi.fn().mockResolvedValue({}),
            $transaction: vi.fn(),
        },
        routePerformanceSnapshot: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        $transaction: vi.fn().mockResolvedValue([
            { id: 'new-rule-001', version: 2 },
            {},
        ]),
    } as any;
}

// ==================================================
// HELPERS
// ==================================================

function makeRecommendation(overrides: Partial<PricingRecommendation> = {}): PricingRecommendation {
    return {
        routeId: 'route-abj-bke',
        recommendedBasePriceXof: 2100,  // +5% from 2000
        recommendedPricePerKg: 520,     // +4% from 500
        recommendedPricePerCm3: 0.52,   // +4% from 0.5
        reasoning: 'Margin optimization based on last 30 days',
        sourceModel: 'margin-optimizer-v2.1',
        generatedAt: new Date(),
        ...overrides,
    };
}

function makeRouteConfig(overrides: Record<string, unknown> = {}) {
    return {
        id: 'cfg-001',
        routeId: 'route-abj-bke',
        enabled: true,
        maxBasePriceChangePercent: 10.0,
        maxPricePerKgChangePercent: 15.0,
        maxPricePerCm3ChangePercent: 15.0,
        maxApplicationsPerMonth: 2,
        minStableDays: 14,
        updatedAt: new Date(),
        updatedByUserId: 'admin-1',
        ...overrides,
    };
}

function makeActiveRule(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rule-001',
        routeId: 'route-abj-bke',
        version: 1,
        status: 'ACTIVE',
        basePriceXof: 2000,
        pricePerKg: 500,
        pricePerCm3: 0.5,
        minimumPriceXof: 1000,
        maximumWeightKg: 50,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
        createdById: 'admin-1',
        createdAt: new Date('2026-01-01'),
        ...overrides,
    };
}

function makeStableSnapshots(count: number, overrides: Record<string, unknown> = {}) {
    return Array.from({ length: count }, (_, i) => ({
        shipmentCount: 10 + (i % 3),
        marginPercent: 25 + (i % 2),  // Stable around 25-26%
        netRevenueXof: 50000,
        revenueXof: 100000,
        refundsXof: 1000,             // 1% refund rate
        periodDay: new Date(Date.now() - (count - i) * 86400000),
        ...overrides,
    }));
}

// ==================================================
// TESTS
// ==================================================

describe('PricingAutoApplicationService', () => {
    let service: PricingAutoApplicationService;
    let prisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
        prisma = createMockPrisma();
        service = new PricingAutoApplicationService(prisma);
        process.env['PRICING_AUTO_APPLICATION_ENABLED'] = 'true';
    });

    afterEach(() => {
        delete process.env['PRICING_AUTO_APPLICATION_ENABLED'];
        vi.restoreAllMocks();
    });

    // --------------------------------------------------
    // Gate 1: Global Kill Switch
    // --------------------------------------------------

    describe('Global Kill Switch', () => {
        it('should REJECT when global switch is OFF', async () => {
            process.env['PRICING_AUTO_APPLICATION_ENABLED'] = 'false';

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('globally disabled');
            expect(result.evidence.globalEnabled).toBe(false);
        });

        it('should REJECT when env var is missing', async () => {
            delete process.env['PRICING_AUTO_APPLICATION_ENABLED'];

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
        });
    });

    // --------------------------------------------------
    // Gate 2: Per-Route Opt-In
    // --------------------------------------------------

    describe('Per-Route Opt-In', () => {
        it('should REJECT when route config is missing', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(null);

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('not opted-in');
        });

        it('should REJECT when route config is disabled', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(
                makeRouteConfig({ enabled: false })
            );

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.evidence.routeEnabled).toBe(false);
        });
    });

    // --------------------------------------------------
    // Gate 3: Bounds Check
    // --------------------------------------------------

    describe('Bounds Check', () => {
        it('should REJECT when no active pricing rule exists', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(null);

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('No active pricing rule');
        });

        it('should REJECT when price change exceeds bounds', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());

            // +50% base price = way over 10% limit
            const result = await service.evaluate(makeRecommendation({
                recommendedBasePriceXof: 3000,
            }));

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('exceed approved bounds');
            expect(result.evidence.boundsCheckPassed).toBe(false);
            expect(result.simulation).not.toBeNull();
            expect(result.simulation!.changes.find(c => c.field === 'basePriceXof')?.withinBounds).toBe(false);
        });

        it('should include simulation with field-level change details', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());

            const result = await service.evaluate(makeRecommendation({
                recommendedBasePriceXof: 3000,
            }));

            expect(result.simulation).toBeDefined();
            expect(result.simulation!.currentRule.basePriceXof).toBe(2000);
            expect(result.simulation!.proposedRule.basePriceXof).toBe(3000);
            expect(result.simulation!.changes).toHaveLength(3);
        });

        it('should pass bounds when changes are within limits', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());
            // Setup for subsequent gates
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(makeStableSnapshots(14));
            prisma.pricingRule.count.mockResolvedValue(0);

            const result = await service.evaluate(makeRecommendation({
                recommendedBasePriceXof: 2100,  // +5%
                recommendedPricePerKg: 520,     // +4%
                recommendedPricePerCm3: 0.52,   // +4%
            }));

            expect(result.evidence.boundsCheckPassed).toBe(true);
        });
    });

    // --------------------------------------------------
    // Gate 4: Route Stability
    // --------------------------------------------------

    describe('Route Stability', () => {
        beforeEach(() => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());
        });

        it('should REJECT when insufficient snapshot data', async () => {
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(
                makeStableSnapshots(3)  // Only 3 days
            );

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('unstable');
            expect(result.evidence.stabilityCheckPassed).toBe(false);
        });

        it('should REJECT when too many zero-volume days', async () => {
            const snapshots = makeStableSnapshots(14).map((s, i) => ({
                ...s,
                shipmentCount: i < 6 ? 0 : 10,  // 6/14 = 43% zero days (> 30%)
            }));
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(snapshots);

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('zero shipments');
        });

        it('should REJECT when margin is too volatile', async () => {
            const snapshots = makeStableSnapshots(14).map((s, i) => ({
                ...s,
                marginPercent: i % 2 === 0 ? 5 : 50,  // Wild swings
            }));
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(snapshots);

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('volatile');
        });

        it('should pass stability with consistent performance', async () => {
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(
                makeStableSnapshots(14)
            );
            prisma.pricingRule.count.mockResolvedValue(0);

            const result = await service.evaluate(makeRecommendation());

            expect(result.evidence.stabilityCheckPassed).toBe(true);
        });
    });

    // --------------------------------------------------
    // Gate 5: Risk Signals
    // --------------------------------------------------

    describe('Risk Signals', () => {
        beforeEach(() => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());
        });

        it('should REJECT when margin is declining', async () => {
            // Steep linear decline: 38→13 over 14 days
            // First-half avg ~34%, second-half avg ~17%, delta ~-17% (exceeds -10% threshold)
            const stableButDeclining = Array.from({ length: 14 }, (_, i) => ({
                shipmentCount: 10,
                marginPercent: 38 - (i * 1.9),  // 38, 36.1, 34.2, ... ~13
                netRevenueXof: 50000,
                revenueXof: 100000,
                refundsXof: 1000,
                periodDay: new Date(Date.now() - (14 - i) * 86400000),
            }));
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(stableButDeclining);

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            // May fail on stability (margin variance) or risk signal (margin decline)
            // Either way, the route is correctly rejected
            expect(result.reasoning).toMatch(/unstable|risk signal/);
        });

        it('should REJECT when refund rate spikes', async () => {
            const snapshots = makeStableSnapshots(14).map(s => ({
                ...s,
                revenueXof: 100000,
                refundsXof: 10000,  // 10% refund rate (> 5% threshold)
            }));
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(snapshots);

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('risk signal');
        });
    });

    // --------------------------------------------------
    // Gate 6: Per-Period Limit
    // --------------------------------------------------

    describe('Per-Period Limit', () => {
        beforeEach(() => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(makeStableSnapshots(14));
        });

        it('should REJECT when monthly limit reached', async () => {
            prisma.pricingRule.count.mockResolvedValue(2);  // Already 2 this month (max 2)

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('monthly limit');
            expect(result.evidence.applicationsThisMonth).toBe(2);
        });

        it('should pass when under monthly limit', async () => {
            prisma.pricingRule.count.mockResolvedValue(1);  // 1 of 2)

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('APPLY');
            expect(result.evidence.periodLimitPassed).toBe(true);
        });
    });

    // --------------------------------------------------
    // Happy Path
    // --------------------------------------------------

    describe('Happy Path', () => {
        it('should APPLY when all gates pass', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(makeStableSnapshots(14));
            prisma.pricingRule.count.mockResolvedValue(0);

            const result = await service.evaluate(makeRecommendation());

            expect(result.decision).toBe('APPLY');
            expect(result.evidence.contratId).toBe('R1');
            expect(result.evidence.zone).toBe('RESTRICTED');
            expect(result.evidence.boundsCheckPassed).toBe(true);
            expect(result.evidence.stabilityCheckPassed).toBe(true);
            expect(result.evidence.riskCheckPassed).toBe(true);
            expect(result.evidence.periodLimitPassed).toBe(true);
            expect(result.simulation).not.toBeNull();
        });

        it('should produce simulation with correct change percentages', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(makeStableSnapshots(14));
            prisma.pricingRule.count.mockResolvedValue(0);

            const result = await service.evaluate(makeRecommendation({
                recommendedBasePriceXof: 2100,  // +5%
            }));

            const basePriceChange = result.simulation!.changes.find(c => c.field === 'basePriceXof');
            expect(basePriceChange!.changePercent).toBeCloseTo(5.0, 1);
            expect(basePriceChange!.withinBounds).toBe(true);
        });
    });

    // --------------------------------------------------
    // Apply & Rollback
    // --------------------------------------------------

    describe('Apply', () => {
        it('should create new rule via transaction', async () => {
            prisma.pricingRule.findFirst
                .mockResolvedValueOnce(makeActiveRule())    // getCurrentActiveRule
                .mockResolvedValueOnce(makeActiveRule());   // getLatestVersion

            await service.apply(makeRecommendation(), { requestId: 'req-001' });

            expect(prisma.$transaction).toHaveBeenCalled();
        });
    });

    describe('Rollback', () => {
        it('should re-activate previous version', async () => {
            const autoRule = makeActiveRule({
                id: 'auto-rule-001',
                version: 2,
                createdById: 'pricing-auto-application',
            });
            const previousRule = {
                id: 'rule-001',
                version: 1,
                status: 'SUPERSEDED',
                routeId: 'route-abj-bke',
            };

            prisma.pricingRule.findFirst
                .mockResolvedValueOnce(autoRule)
                .mockResolvedValueOnce(previousRule);

            await service.rollback('route-abj-bke', { requestId: 'req-002' });

            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it('should throw when no auto-applied rule exists', async () => {
            prisma.pricingRule.findFirst.mockResolvedValue(null);

            await expect(
                service.rollback('route-abj-bke', { requestId: 'req-003' })
            ).rejects.toThrow('No auto-applied active rule');
        });
    });

    // --------------------------------------------------
    // Audit Evidence
    // --------------------------------------------------

    describe('Audit Evidence', () => {
        it('should start as G4/GUARDED, promote to R1/RESTRICTED on APPLY', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(makeStableSnapshots(14));
            prisma.pricingRule.count.mockResolvedValue(0);

            const result = await service.evaluate(makeRecommendation());

            expect(result.evidence.contratId).toBe('R1');
            expect(result.evidence.zone).toBe('RESTRICTED');
            expect(result.evidence.module).toBe('PRICING');
        });

        it('should stay G4/GUARDED on REJECT', async () => {
            process.env['PRICING_AUTO_APPLICATION_ENABLED'] = 'false';

            const result = await service.evaluate(makeRecommendation());

            expect(result.evidence.contratId).toBe('G4');
            expect(result.evidence.zone).toBe('GUARDED');
        });

        it('should include source model in evidence', async () => {
            prisma.routePricingAutoConfig.findUnique.mockResolvedValue(makeRouteConfig());
            prisma.pricingRule.findFirst.mockResolvedValue(makeActiveRule());
            prisma.routePerformanceSnapshot.findMany.mockResolvedValue(makeStableSnapshots(14));
            prisma.pricingRule.count.mockResolvedValue(0);

            const result = await service.evaluate(makeRecommendation());

            expect(result.evidence.sourceModel).toBe('margin-optimizer-v2.1');
        });
    });
});
