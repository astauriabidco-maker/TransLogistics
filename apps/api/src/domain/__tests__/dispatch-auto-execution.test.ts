/**
 * Dispatch Auto-Execution — Governance Tests
 *
 * Tests the DispatchAutoExecutionService (Contract G3).
 * Validates 5 decision gates, execute, override, and audit logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DispatchAutoExecutionService } from '../../services/dispatch-auto-execution.service';
import type { RoutePlanForEvaluation } from '../../services/dispatch-auto-execution.service';

// ==================================================
// MOCK PRISMA
// ==================================================

function createMockPrisma() {
    return {
        hubDispatchAutoConfig: {
            findUnique: vi.fn().mockResolvedValue(null),
        },
        driver: {
            findUnique: vi.fn().mockResolvedValue(null),
        },
        dispatchTask: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue({ id: 'task-001' }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        shipment: {
            count: vi.fn().mockResolvedValue(0),
        },
        routePlan: {
            update: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockResolvedValue([{}, {}]),
    } as any;
}

// ==================================================
// HELPERS
// ==================================================

function makePlan(overrides: Partial<RoutePlanForEvaluation> = {}): RoutePlanForEvaluation {
    return {
        routePlanId: 'plan-001',
        hubId: 'hub-abj',
        driverId: 'driver-001',
        routeId: 'route-abj-bke',
        planDate: new Date(),
        status: 'APPROVED',
        shipmentIds: ['ship-001', 'ship-002', 'ship-003'],
        totalWeightKg: 150,
        ...overrides,
    };
}

function makeHubConfig(overrides: Record<string, unknown> = {}) {
    return {
        id: 'cfg-001',
        hubId: 'hub-abj',
        enabled: true,
        maxTasksPerPlan: 15,
        maxTotalWeightKg: 500,
        requireApprovedPlan: true,
        requireDriverOptIn: true,
        updatedAt: new Date(),
        updatedByUserId: 'admin-1',
        ...overrides,
    };
}

function makeDriver(overrides: Record<string, unknown> = {}) {
    return {
        id: 'driver-001',
        status: 'ACTIVE',
        isAvailable: true,
        autoDispatchOptIn: true,
        ...overrides,
    };
}

// ==================================================
// TESTS
// ==================================================

describe('DispatchAutoExecutionService', () => {
    let service: DispatchAutoExecutionService;
    let prisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
        prisma = createMockPrisma();
        service = new DispatchAutoExecutionService(prisma);
        process.env['DISPATCH_AUTO_EXECUTION_ENABLED'] = 'true';
    });

    afterEach(() => {
        delete process.env['DISPATCH_AUTO_EXECUTION_ENABLED'];
        vi.restoreAllMocks();
    });

    // --------------------------------------------------
    // Gate 1: Global Kill Switch
    // --------------------------------------------------

    describe('Global Kill Switch', () => {
        it('should REQUIRE_MANUAL when global switch is OFF', async () => {
            process.env['DISPATCH_AUTO_EXECUTION_ENABLED'] = 'false';

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('globally disabled');
            expect(result.evidence.globalEnabled).toBe(false);
        });

        it('should REQUIRE_MANUAL when env var is missing', async () => {
            delete process.env['DISPATCH_AUTO_EXECUTION_ENABLED'];

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
        });
    });

    // --------------------------------------------------
    // Gate 2: Hub Opt-In
    // --------------------------------------------------

    describe('Hub Opt-In', () => {
        it('should REQUIRE_MANUAL when hub config is missing', async () => {
            prisma.hubDispatchAutoConfig.findUnique.mockResolvedValue(null);

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('not opted-in');
        });

        it('should REQUIRE_MANUAL when hub config is disabled', async () => {
            prisma.hubDispatchAutoConfig.findUnique.mockResolvedValue(
                makeHubConfig({ enabled: false })
            );

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.evidence.hubEnabled).toBe(false);
        });
    });

    // --------------------------------------------------
    // Gate 3: Plan Constraints
    // --------------------------------------------------

    describe('Plan Constraints', () => {
        beforeEach(() => {
            prisma.hubDispatchAutoConfig.findUnique.mockResolvedValue(makeHubConfig());
        });

        it('should REQUIRE_MANUAL when plan is not APPROVED', async () => {
            const result = await service.evaluate(makePlan({ status: 'DRAFT' }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('DRAFT');
            expect(result.reasoning).toContain('expected APPROVED');
        });

        it('should REQUIRE_MANUAL when shipment count exceeds limit', async () => {
            const manyShipments = Array.from({ length: 20 }, (_, i) => `ship-${i}`);
            const result = await service.evaluate(makePlan({ shipmentIds: manyShipments }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('exceeds max');
        });

        it('should REQUIRE_MANUAL when total weight exceeds limit', async () => {
            const result = await service.evaluate(makePlan({ totalWeightKg: 600 }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('exceeds max');
        });

        it('should REQUIRE_MANUAL when plan has no shipments', async () => {
            const result = await service.evaluate(makePlan({ shipmentIds: [] }));

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('no shipments');
        });
    });

    // --------------------------------------------------
    // Gate 4: Driver Availability + Opt-In
    // --------------------------------------------------

    describe('Driver Check', () => {
        beforeEach(() => {
            prisma.hubDispatchAutoConfig.findUnique.mockResolvedValue(makeHubConfig());
        });

        it('should REQUIRE_MANUAL when driver not found', async () => {
            prisma.driver.findUnique.mockResolvedValue(null);

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('not found');
        });

        it('should REQUIRE_MANUAL when driver is not ACTIVE', async () => {
            prisma.driver.findUnique.mockResolvedValue(makeDriver({ status: 'SUSPENDED' }));

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('SUSPENDED');
        });

        it('should REQUIRE_MANUAL when driver is not available', async () => {
            prisma.driver.findUnique.mockResolvedValue(makeDriver({ isAvailable: false }));

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('not available');
        });

        it('should REQUIRE_MANUAL when driver has not opted in', async () => {
            prisma.driver.findUnique.mockResolvedValue(makeDriver({ autoDispatchOptIn: false }));

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('not opted in');
        });

        it('should pass when driver is ACTIVE, available, and opted-in', async () => {
            prisma.driver.findUnique.mockResolvedValue(makeDriver());
            // Set up for Gate 5
            prisma.dispatchTask.count.mockResolvedValue(0);
            prisma.shipment.count.mockResolvedValue(0);

            const result = await service.evaluate(makePlan());

            expect(result.evidence.driverCheckPassed).toBe(true);
        });
    });

    // --------------------------------------------------
    // Gate 5: Exception Flags
    // --------------------------------------------------

    describe('Exception Flags', () => {
        beforeEach(() => {
            prisma.hubDispatchAutoConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.driver.findUnique.mockResolvedValue(makeDriver());
        });

        it('should REQUIRE_MANUAL when failed tasks exist today', async () => {
            prisma.dispatchTask.count.mockResolvedValue(2);

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('failed dispatch task');
        });

        it('should REQUIRE_MANUAL when shipments have holds', async () => {
            prisma.dispatchTask.count.mockResolvedValue(0);
            prisma.shipment.count.mockResolvedValue(1);

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('REQUIRE_MANUAL');
            expect(result.reasoning).toContain('holds');
        });

        it('should pass when no exceptions', async () => {
            prisma.dispatchTask.count.mockResolvedValue(0);
            prisma.shipment.count.mockResolvedValue(0);

            const result = await service.evaluate(makePlan());

            expect(result.evidence.exceptionCheckPassed).toBe(true);
        });
    });

    // --------------------------------------------------
    // Happy Path
    // --------------------------------------------------

    describe('Happy Path', () => {
        it('should AUTO_EXECUTE when all gates pass', async () => {
            prisma.hubDispatchAutoConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.driver.findUnique.mockResolvedValue(makeDriver());
            prisma.dispatchTask.count.mockResolvedValue(0);
            prisma.shipment.count.mockResolvedValue(0);

            const result = await service.evaluate(makePlan());

            expect(result.decision).toBe('AUTO_EXECUTE');
            expect(result.evidence.contratId).toBe('G3');
            expect(result.evidence.zone).toBe('GUARDED');
            expect(result.evidence.planConstraintsPassed).toBe(true);
            expect(result.evidence.driverCheckPassed).toBe(true);
            expect(result.evidence.exceptionCheckPassed).toBe(true);
        });
    });

    // --------------------------------------------------
    // Execute
    // --------------------------------------------------

    describe('Execute', () => {
        it('should create dispatch task and transition route plan', async () => {
            const plan = makePlan();

            const result = await service.execute(plan, { requestId: 'req-001' });

            expect(result.dispatchTaskId).toBe('task-001');
            expect(result.shipmentCount).toBe(3);
            expect(prisma.routePlan.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: plan.routePlanId },
                    data: expect.objectContaining({ status: 'IN_PROGRESS' }),
                })
            );
            expect(prisma.dispatchTask.create).toHaveBeenCalled();
        });
    });

    // --------------------------------------------------
    // Override
    // --------------------------------------------------

    describe('Override', () => {
        it('should CANCEL with required reason', async () => {
            const result = await service.override(
                'plan-001',
                'CANCEL',
                'Weather conditions unsafe for delivery',
                { userId: 'ops-admin-1', requestId: 'req-002' }
            );

            expect(result.action).toBe('CANCEL');
            expect(result.reason).toBe('Weather conditions unsafe for delivery');
            expect(result.overriddenBy).toBe('ops-admin-1');
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it('should reject override without reason', async () => {
            await expect(
                service.override(
                    'plan-001',
                    'CANCEL',
                    '',
                    { userId: 'ops-admin-1', requestId: 'req-003' }
                )
            ).rejects.toThrow('Override reason is required');
        });

        it('should ADJUST without cancelling tasks', async () => {
            const result = await service.override(
                'plan-001',
                'ADJUST',
                'Removing high-priority shipment for separate delivery',
                { userId: 'ops-admin-1', requestId: 'req-004' }
            );

            expect(result.action).toBe('ADJUST');
            // ADJUST does not cancel tasks (ops makes manual changes)
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });

    // --------------------------------------------------
    // Audit Evidence
    // --------------------------------------------------

    describe('Audit Evidence', () => {
        it('should always include G3/GUARDED contract metadata', async () => {
            prisma.hubDispatchAutoConfig.findUnique.mockResolvedValue(makeHubConfig());
            prisma.driver.findUnique.mockResolvedValue(makeDriver());
            prisma.dispatchTask.count.mockResolvedValue(0);
            prisma.shipment.count.mockResolvedValue(0);

            const result = await service.evaluate(makePlan());

            expect(result.evidence.contratId).toBe('G3');
            expect(result.evidence.zone).toBe('GUARDED');
            expect(result.evidence.module).toBe('DISPATCH');
        });

        it('should include plan details in evidence', async () => {
            process.env['DISPATCH_AUTO_EXECUTION_ENABLED'] = 'false';

            const result = await service.evaluate(makePlan({
                totalWeightKg: 250,
                shipmentIds: ['s1', 's2'],
            }));

            expect(result.evidence.taskCount).toBe(2);
            expect(result.evidence.totalWeightKg).toBe(250);
        });
    });
});
