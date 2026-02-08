/**
 * PricingAutoApplicationService — Unit Tests
 *
 * Contracts G4/R1 — 6 gates:
 *   Gate 1: Global kill switch
 *   Gate 2: Per-route opt-in
 *   Gate 3: Bounds check (max % change per field)
 *   Gate 4: Route stability
 *   Gate 5: Risk signals
 *   Gate 6: Per-period limit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../test/prisma-mock';
import {
    PricingAutoApplicationService,
    type PricingRecommendation,
} from '../pricing-auto-application.service';

function mockRecommendation(overrides: Partial<PricingRecommendation> = {}): PricingRecommendation {
    return {
        routeId: 'route-001',
        recommendedBasePriceXof: 5500,
        recommendedPricePerKg: 110,
        recommendedPricePerCm3: 0.55,
        reasoning: 'Volume increase detected',
        sourceModel: 'pricing-ml-v3',
        generatedAt: new Date('2026-02-08'),
        ...overrides,
    };
}

function mockRouteConfig(overrides: Record<string, unknown> = {}) {
    return {
        routeId: 'route-001',
        enabled: true,
        maxBasePriceChangePercent: 10,
        maxPricePerKgChangePercent: 15,
        maxPricePerCm3ChangePercent: 15,
        minStableDays: 7,
        maxApplicationsPerMonth: 5,
        ...overrides,
    };
}

describe('PricingAutoApplicationService', () => {
    let service: PricingAutoApplicationService;

    beforeEach(() => {
        resetPrismaMock();
        vi.restoreAllMocks();
        service = new PricingAutoApplicationService(prismaMock as any);
    });

    // ────────────────────────────────────────────
    // Gate 1: Global kill switch
    // ────────────────────────────────────────────

    describe('Gate 1 — Global kill switch', () => {
        it('should REJECT when global is disabled', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(false);

            const result = await service.evaluate(mockRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('globally disabled');
        });
    });

    // ────────────────────────────────────────────
    // Gate 2: Route opt-in
    // ────────────────────────────────────────────

    describe('Gate 2 — Route opt-in', () => {
        it('should REJECT when route config missing', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getRouteConfig').mockResolvedValue(null);

            const result = await service.evaluate(mockRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('not opted-in');
        });

        it('should REJECT when route config disabled', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getRouteConfig').mockResolvedValue(mockRouteConfig({ enabled: false }) as any);

            const result = await service.evaluate(mockRecommendation());

            expect(result.decision).toBe('REJECT');
        });
    });

    // ────────────────────────────────────────────
    // Gate 3: Bounds check
    // ────────────────────────────────────────────

    describe('Gate 3 — Bounds check', () => {
        it('should REJECT when no active pricing rule', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getRouteConfig').mockResolvedValue(mockRouteConfig() as any);
            vi.spyOn(service, 'getCurrentActiveRule').mockResolvedValue(null);

            const result = await service.evaluate(mockRecommendation());

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('No active pricing rule');
        });

        it('should REJECT when base price change exceeds max', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getRouteConfig').mockResolvedValue(mockRouteConfig({ maxBasePriceChangePercent: 5 }) as any);
            vi.spyOn(service, 'getCurrentActiveRule').mockResolvedValue({
                basePriceXof: 5000, pricePerKg: 100, pricePerCm3: 0.50, minimumPriceXof: 2000,
            } as any);

            // 5000 → 5500 = 10% change, max is 5%
            const result = await service.evaluate(mockRecommendation({ recommendedBasePriceXof: 5500 }));

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('exceed approved bounds');
        });

        it('should pass when changes are within bounds', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getRouteConfig').mockResolvedValue(mockRouteConfig() as any);
            vi.spyOn(service, 'getCurrentActiveRule').mockResolvedValue({
                basePriceXof: 5000, pricePerKg: 100, pricePerCm3: 0.50, minimumPriceXof: 2000,
            } as any);
            // Mock remaining gates to pass
            vi.spyOn(service as any, 'checkRouteStability').mockResolvedValue({ stable: true, reason: '' });
            vi.spyOn(service as any, 'checkRiskSignals').mockResolvedValue({ safe: true, reason: '' });
            vi.spyOn(service, 'countApplicationsThisMonth').mockResolvedValue(0);

            // 5000 → 5400 = 8% change, max is 10% → pass
            const result = await service.evaluate(mockRecommendation({
                recommendedBasePriceXof: 5400,
                recommendedPricePerKg: 105,
                recommendedPricePerCm3: 0.52,
            }));

            expect(result.decision).toBe('APPLY');
        });
    });

    // ────────────────────────────────────────────
    // Gate 4: Route stability
    // ────────────────────────────────────────────

    describe('Gate 4 — Route stability', () => {
        it('should REJECT when route is unstable', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getRouteConfig').mockResolvedValue(mockRouteConfig() as any);
            vi.spyOn(service, 'getCurrentActiveRule').mockResolvedValue({
                basePriceXof: 5000, pricePerKg: 100, pricePerCm3: 0.50, minimumPriceXof: 2000,
            } as any);
            vi.spyOn(service as any, 'checkRouteStability').mockResolvedValue({
                stable: false,
                reason: 'Price changed 3 days ago',
            });

            const result = await service.evaluate(mockRecommendation({
                recommendedBasePriceXof: 5200,
                recommendedPricePerKg: 103,
                recommendedPricePerCm3: 0.51,
            }));

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('unstable');
        });
    });

    // ────────────────────────────────────────────
    // Gate 5: Risk signals
    // ────────────────────────────────────────────

    describe('Gate 5 — Risk signals', () => {
        it('should REJECT when active risk signal', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getRouteConfig').mockResolvedValue(mockRouteConfig() as any);
            vi.spyOn(service, 'getCurrentActiveRule').mockResolvedValue({
                basePriceXof: 5000, pricePerKg: 100, pricePerCm3: 0.50, minimumPriceXof: 2000,
            } as any);
            vi.spyOn(service as any, 'checkRouteStability').mockResolvedValue({ stable: true, reason: '' });
            vi.spyOn(service as any, 'checkRiskSignals').mockResolvedValue({
                safe: false,
                reason: 'Refund spike 7.2% > 5% threshold',
            });

            const result = await service.evaluate(mockRecommendation({
                recommendedBasePriceXof: 5200,
                recommendedPricePerKg: 103,
                recommendedPricePerCm3: 0.51,
            }));

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('risk signal');
        });
    });

    // ────────────────────────────────────────────
    // Gate 6: Per-period limit
    // ────────────────────────────────────────────

    describe('Gate 6 — Period limit', () => {
        it('should REJECT when monthly limit reached', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getRouteConfig').mockResolvedValue(mockRouteConfig({ maxApplicationsPerMonth: 3 }) as any);
            vi.spyOn(service, 'getCurrentActiveRule').mockResolvedValue({
                basePriceXof: 5000, pricePerKg: 100, pricePerCm3: 0.50, minimumPriceXof: 2000,
            } as any);
            vi.spyOn(service as any, 'checkRouteStability').mockResolvedValue({ stable: true, reason: '' });
            vi.spyOn(service as any, 'checkRiskSignals').mockResolvedValue({ safe: true, reason: '' });
            vi.spyOn(service, 'countApplicationsThisMonth').mockResolvedValue(3);

            const result = await service.evaluate(mockRecommendation({
                recommendedBasePriceXof: 5200,
                recommendedPricePerKg: 103,
                recommendedPricePerCm3: 0.51,
            }));

            expect(result.decision).toBe('REJECT');
            expect(result.reasoning).toContain('monthly limit');
        });
    });

    // ────────────────────────────────────────────
    // All gates pass
    // ────────────────────────────────────────────

    describe('All gates pass', () => {
        it('should APPLY and promote to R1 contract', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockReturnValue(true);
            vi.spyOn(service, 'getRouteConfig').mockResolvedValue(mockRouteConfig() as any);
            vi.spyOn(service, 'getCurrentActiveRule').mockResolvedValue({
                basePriceXof: 5000, pricePerKg: 100, pricePerCm3: 0.50, minimumPriceXof: 2000,
            } as any);
            vi.spyOn(service as any, 'checkRouteStability').mockResolvedValue({ stable: true, reason: '' });
            vi.spyOn(service as any, 'checkRiskSignals').mockResolvedValue({ safe: true, reason: '' });
            vi.spyOn(service, 'countApplicationsThisMonth').mockResolvedValue(1);

            const result = await service.evaluate(mockRecommendation({
                recommendedBasePriceXof: 5200,
                recommendedPricePerKg: 103,
                recommendedPricePerCm3: 0.51,
            }));

            expect(result.decision).toBe('APPLY');
            // On approval, contract is promoted from G4 → R1
            expect(result.evidence.contratId).toBe('R1');
            expect(result.evidence.zone).toBe('RESTRICTED');
        });
    });

    // ────────────────────────────────────────────
    // Simulation data
    // ────────────────────────────────────────────

    describe('Simulation', () => {
        it('should compute field changes correctly', () => {
            const simulation = service.computeSimulation(
                { basePriceXof: 5000, pricePerKg: 100, pricePerCm3: 0.50, minimumPriceXof: 2000 } as any,
                mockRecommendation({ recommendedBasePriceXof: 5500, recommendedPricePerKg: 110, recommendedPricePerCm3: 0.55 }),
                mockRouteConfig() as any,
            );

            expect(simulation.changes.length).toBe(3);

            const basePriceChange = simulation.changes.find(c => c.field === 'basePriceXof');
            expect(basePriceChange).toBeDefined();
            expect(basePriceChange!.changePercent).toBeCloseTo(10.0, 1);
            expect(basePriceChange!.withinBounds).toBe(true); // 10% = max 10%
        });
    });
});
