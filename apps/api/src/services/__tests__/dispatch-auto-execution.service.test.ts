/**
 * DispatchAutoExecutionService — Unit Tests
 *
 * Contract G3 — 5 gates:
 *   Gate 1: Global kill switch
 *   Gate 2: Hub opt-in
 *   Gate 3: Route plan constraints (max tasks, weight, approved status)
 *   Gate 4: Driver availability + opt-in
 *   Gate 5: Exception flags
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../test/prisma-mock';
import {
    DispatchAutoExecutionService,
    type RoutePlanForEvaluation,
} from '../dispatch-auto-execution.service';

function mockPlan(overrides: Partial<RoutePlanForEvaluation> = {}): RoutePlanForEvaluation {
    return {
        routePlanId: 'plan-001',
        hubId: 'hub-001',
        driverId: 'driver-001',
        routeId: 'route-001',
        planDate: new Date('2026-02-08'),
        status: 'APPROVED',
        shipmentIds: ['s1', 's2', 's3'],
        totalWeightKg: 120,
        ...overrides,
    };
}

function mockHubConfig(overrides: Record<string, unknown> = {}) {
    return {
        hubId: 'hub-001',
        enabled: true,
        maxTasksPerPlan: 10,
        maxTotalWeightKg: 500,
        requireApprovedPlan: true,
        requireDriverOptIn: true,
        ...overrides,
    };
}

describe('DispatchAutoExecutionService', () => {
    let service: DispatchAutoExecutionService;

    beforeEach(() => {
        resetPrismaMock();
        vi.restoreAllMocks();
        service = new DispatchAutoExecutionService(prismaMock as any);
    });

    // ────────────────────────────────────────────
    // Gate 1: Global kill switch
    // ────────────────────────────────────────────

    describe('Gate 1 — Global kill switch', () => {
        it('should REQUIRE_MANUAL when global is disabled', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(false);

            const result = await service.evaluate(mockPlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('globally disabled');
        });
    });

    // ────────────────────────────────────────────
    // Gate 2: Hub opt-in
    // ────────────────────────────────────────────

    describe('Gate 2 — Hub opt-in', () => {
        it('should REQUIRE_MANUAL when hub not opted-in', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue(null);

            const result = await service.evaluate(mockPlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('not opted-in');
        });

        it('should REQUIRE_MANUAL when hub config disabled', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue(mockHubConfig({ enabled: false }) as any);

            const result = await service.evaluate(mockPlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
        });
    });

    // ────────────────────────────────────────────
    // Gate 3: Plan constraints
    // ────────────────────────────────────────────

    describe('Gate 3 — Plan constraints', () => {
        it('should REQUIRE_MANUAL when tasks exceed max', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue(mockHubConfig({ maxTasksPerPlan: 2 }) as any);

            const result = await service.evaluate(mockPlan({ shipmentIds: ['s1', 's2', 's3'] }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('constraints not met');
        });

        it('should REQUIRE_MANUAL when weight exceeds max', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue(mockHubConfig({ maxTotalWeightKg: 100 }) as any);

            const result = await service.evaluate(mockPlan({ totalWeightKg: 150 }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
        });
    });

    // ────────────────────────────────────────────
    // Gate 4: Driver check
    // ────────────────────────────────────────────

    describe('Gate 4 — Driver check', () => {
        it('should REQUIRE_MANUAL when driver not found', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue(mockHubConfig() as any);
            vi.spyOn(service as any, 'checkPlanConstraints').mockReturnValue({ passed: true, reason: '' });
            vi.spyOn(service as any, 'checkDriver').mockResolvedValue({ passed: false, reason: 'Driver not found' });

            const result = await service.evaluate(mockPlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('Driver check failed');
        });
    });

    // ────────────────────────────────────────────
    // Gate 5: Exception flags
    // ────────────────────────────────────────────

    describe('Gate 5 — Exception flags', () => {
        it('should REQUIRE_MANUAL when exception flag detected', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue(mockHubConfig() as any);
            vi.spyOn(service as any, 'checkPlanConstraints').mockReturnValue({ passed: true, reason: '' });
            vi.spyOn(service as any, 'checkDriver').mockResolvedValue({ passed: true, reason: '' });
            vi.spyOn(service as any, 'checkExceptionFlags').mockResolvedValue({
                passed: false,
                reason: 'Fragile shipment in batch',
            });

            const result = await service.evaluate(mockPlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('Exception flag');
        });
    });

    // ────────────────────────────────────────────
    // All gates pass
    // ────────────────────────────────────────────

    describe('All gates pass', () => {
        it('should AUTO_EXECUTE when all conditions met', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(true);
            vi.spyOn(service, 'getHubConfig').mockResolvedValue(mockHubConfig() as any);
            vi.spyOn(service as any, 'checkPlanConstraints').mockReturnValue({ passed: true, reason: '' });
            vi.spyOn(service as any, 'checkDriver').mockResolvedValue({ passed: true, reason: '' });
            vi.spyOn(service as any, 'checkExceptionFlags').mockResolvedValue({ passed: true, reason: '' });

            const result = await service.evaluate(mockPlan());

            expect(result.decision).toBe('AUTO_EXECUTE');
            expect(result.evidence.contratId).toBe('G3');
            expect(result.evidence.zone).toBe('GUARDED');
        });
    });

    // ────────────────────────────────────────────
    // Evidence
    // ────────────────────────────────────────────

    describe('Evidence', () => {
        it('should include task count and weight', async () => {
            vi.spyOn(service, 'isGlobalEnabled').mockResolvedValue(false);

            const plan = mockPlan({ shipmentIds: ['s1', 's2'], totalWeightKg: 75 });
            const result = await service.evaluate(plan);

            expect(result.evidence.taskCount).toBe(2);
            expect(result.evidence.totalWeightKg).toBe(75);
        });
    });
});
