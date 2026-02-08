/**
 * DispatchAutoExecutionService
 *
 * Contract G3 — Guarded Zone Automation
 * Governs automatic execution of dispatch plans.
 *
 * Decision flow:
 *   1. Global kill switch (DISPATCH_AUTO_EXECUTION_ENABLED env)
 *   2. Hub opt-in (HubDispatchAutoConfig.enabled)
 *   3. Route plan constraints (APPROVED, task count, total weight)
 *   4. Driver availability + opt-in (ACTIVE, isAvailable, autoDispatchOptIn)
 *   5. No exception flags (no FAILED tasks today, no shipment issues)
 *
 * Constraints:
 *   - NO forced dispatch
 *   - NO driver auto-assignment without opt-in
 *   - Human override always possible with required reason
 */

import type { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// TYPES
// ==================================================

export interface RoutePlanForEvaluation {
    routePlanId: string;
    hubId: string;
    driverId: string;
    routeId: string;
    planDate: Date;
    status: string;
    shipmentIds: string[];
    totalWeightKg: number;
}

export type DispatchDecisionType = 'AUTO_EXECUTE' | 'REQUIRE_MANUAL';

export interface DispatchAutoExecutionDecision {
    decision: DispatchDecisionType;
    reasoning: string;
    evidence: DispatchAutoExecutionEvidence;
}

export interface DispatchAutoExecutionEvidence {
    contratId: 'G3';
    zone: 'GUARDED';
    module: 'DISPATCH';
    routePlanId: string;
    hubId: string;
    driverId: string;
    globalEnabled: boolean;
    hubEnabled: boolean;
    planConstraintsPassed: boolean;
    driverCheckPassed: boolean | null;
    exceptionCheckPassed: boolean | null;
    taskCount: number;
    totalWeightKg: number;
    evaluatedAt: string;
}

export type OverrideAction = 'CANCEL' | 'ADJUST';

export interface DispatchOverrideResult {
    routePlanId: string;
    action: OverrideAction;
    reason: string;
    overriddenBy: string;
    overriddenAt: string;
}

// ==================================================
// SERVICE
// ==================================================

export class DispatchAutoExecutionService {
    private readonly log = logger.child({ service: 'dispatch.auto-execution' });

    constructor(private readonly prisma: PrismaClient) { }

    // ==================================================
    // EVALUATE — 5-Gate Decision Pipeline
    // ==================================================

    async evaluate(plan: RoutePlanForEvaluation): Promise<DispatchAutoExecutionDecision> {
        const globalEnabled = await this.isGlobalEnabled();
        const hubConfig = await this.getHubConfig(plan.hubId);
        const hubEnabled = hubConfig?.enabled ?? false;

        const evidence: DispatchAutoExecutionEvidence = {
            contratId: 'G3',
            zone: 'GUARDED',
            module: 'DISPATCH',
            routePlanId: plan.routePlanId,
            hubId: plan.hubId,
            driverId: plan.driverId,
            globalEnabled,
            hubEnabled,
            planConstraintsPassed: false,
            driverCheckPassed: null,
            exceptionCheckPassed: null,
            taskCount: plan.shipmentIds.length,
            totalWeightKg: plan.totalWeightKg,
            evaluatedAt: new Date().toISOString(),
        };

        // ── Gate 1: Global kill switch ──
        if (!globalEnabled) {
            return this.decide('REQUIRE_MANUAL',
                'Dispatch auto-execution globally disabled (DISPATCH_AUTO_EXECUTION_ENABLED != true)',
                evidence);
        }

        // ── Gate 2: Hub opt-in ──
        if (!hubEnabled) {
            return this.decide('REQUIRE_MANUAL',
                `Hub ${plan.hubId} not opted-in for dispatch auto-execution`,
                evidence);
        }

        // ── Gate 3: Route plan constraints ──
        const constraintResult = this.checkPlanConstraints(plan, hubConfig!);
        evidence.planConstraintsPassed = constraintResult.passed;

        if (!constraintResult.passed) {
            return this.decide('REQUIRE_MANUAL',
                `Route plan constraints not met: ${constraintResult.reason}`,
                evidence);
        }

        // ── Gate 4: Driver availability + opt-in ──
        const driverResult = await this.checkDriver(plan.driverId, hubConfig!);
        evidence.driverCheckPassed = driverResult.passed;

        if (!driverResult.passed) {
            return this.decide('REQUIRE_MANUAL',
                `Driver check failed: ${driverResult.reason}`,
                evidence);
        }

        // ── Gate 5: No exception flags ──
        const exceptionResult = await this.checkExceptionFlags(plan);
        evidence.exceptionCheckPassed = exceptionResult.passed;

        if (!exceptionResult.passed) {
            return this.decide('REQUIRE_MANUAL',
                `Exception flag detected: ${exceptionResult.reason}`,
                evidence);
        }

        // ── All gates passed ──
        return this.decide('AUTO_EXECUTE',
            `All gates passed — ${plan.shipmentIds.length} shipments, ${plan.totalWeightKg.toFixed(1)}kg, driver available and opted-in`,
            evidence);
    }

    // ==================================================
    // EXECUTE — Create Dispatch Tasks
    // ==================================================

    async execute(
        plan: RoutePlanForEvaluation,
        ctx: { userId?: string; requestId: string },
    ): Promise<{ dispatchTaskId: string; shipmentCount: number }> {
        // Transition RoutePlan to IN_PROGRESS
        await this.prisma.routePlan.update({
            where: { id: plan.routePlanId },
            data: { status: 'IN_PROGRESS', startedAt: new Date() },
        });

        // Create DispatchTask
        const dispatchTask = await this.prisma.dispatchTask.create({
            data: {
                driverId: plan.driverId,
                routeId: plan.routeId,
                status: 'ASSIGNED',
                routePlanId: plan.routePlanId,
                shipments: {
                    create: plan.shipmentIds.map((shipmentId, idx) => ({
                        shipmentId,
                        sequenceOrder: idx + 1,
                    })),
                },
            },
        });

        // Update RoutePlan task counters
        await this.prisma.routePlan.update({
            where: { id: plan.routePlanId },
            data: { totalTasks: { increment: 1 } },
        });

        this.log.info({
            audit: true,
            contratId: 'G3',
            zone: 'GUARDED',
            module: 'DISPATCH',
            action: 'AUTO_EXECUTED',
            routePlanId: plan.routePlanId,
            dispatchTaskId: dispatchTask.id,
            driverId: plan.driverId,
            routeId: plan.routeId,
            shipmentCount: plan.shipmentIds.length,
            totalWeightKg: plan.totalWeightKg,
            executedBy: 'dispatch-auto-execution',
        }, `[G3] Dispatch auto-executed: plan ${plan.routePlanId} → task ${dispatchTask.id}`);

        return {
            dispatchTaskId: dispatchTask.id,
            shipmentCount: plan.shipmentIds.length,
        };
    }

    // ==================================================
    // OVERRIDE — Human Cancel or Adjust
    // ==================================================

    async override(
        routePlanId: string,
        action: OverrideAction,
        reason: string,
        ctx: { userId: string; requestId: string },
    ): Promise<DispatchOverrideResult> {
        if (!reason || reason.trim().length === 0) {
            throw new Error('Override reason is required — cancellation without justification is not permitted');
        }

        if (action === 'CANCEL') {
            // Cancel the route plan and any ASSIGNED dispatch tasks
            await this.prisma.$transaction([
                this.prisma.routePlan.update({
                    where: { id: routePlanId },
                    data: { status: 'CANCELLED' },
                }),
                this.prisma.dispatchTask.updateMany({
                    where: {
                        routePlanId,
                        status: 'ASSIGNED',
                    },
                    data: {
                        status: 'FAILED',
                        failedAt: new Date(),
                        failureReason: `Override CANCEL by ${ctx.userId}: ${reason}`,
                    },
                }),
            ]);
        }

        const result: DispatchOverrideResult = {
            routePlanId,
            action,
            reason,
            overriddenBy: ctx.userId,
            overriddenAt: new Date().toISOString(),
        };

        this.log.info({
            audit: true,
            contratId: 'G3',
            zone: 'GUARDED',
            module: 'DISPATCH',
            action: `OVERRIDE_${action}`,
            routePlanId,
            reason,
            overriddenBy: ctx.userId,
            requestId: ctx.requestId,
        }, `[G3] Dispatch override: ${action} on plan ${routePlanId} by ${ctx.userId} — ${reason}`);

        return result;
    }

    // ==================================================
    // INTERNAL: Decision + Audit
    // ==================================================

    private decide(
        decision: DispatchDecisionType,
        reasoning: string,
        evidence: DispatchAutoExecutionEvidence,
    ): DispatchAutoExecutionDecision {
        const result: DispatchAutoExecutionDecision = { decision, reasoning, evidence };

        this.log.info({
            audit: true,
            contratId: evidence.contratId,
            zone: evidence.zone,
            module: evidence.module,
            action: decision === 'AUTO_EXECUTE' ? 'APPROVED' : 'REQUIRE_MANUAL',
            decision,
            reasoning,
            routePlanId: evidence.routePlanId,
            driverId: evidence.driverId,
            hubId: evidence.hubId,
            taskCount: evidence.taskCount,
            totalWeightKg: evidence.totalWeightKg,
        }, `[G3] Dispatch auto-execution: ${decision} — ${reasoning}`);

        return result;
    }

    // ==================================================
    // INTERNAL: Kill Switch
    // ==================================================

    async isGlobalEnabled(): Promise<boolean> {
        const config = await this.prisma.automationGlobalConfig.findUnique({
            where: { module: 'DISPATCH' },
        });
        if (!config) return process.env['DISPATCH_AUTO_EXECUTION_ENABLED'] === 'true';
        return config.enabled;
    }

    // ==================================================
    // INTERNAL: Hub Config
    // ==================================================

    async getHubConfig(hubId: string) {
        return this.prisma.hubDispatchAutoConfig.findUnique({
            where: { hubId },
        });
    }

    // ==================================================
    // INTERNAL: Gate 3 — Plan Constraints
    // ==================================================

    private checkPlanConstraints(
        plan: RoutePlanForEvaluation,
        config: { maxTasksPerPlan: number; maxTotalWeightKg: unknown; requireApprovedPlan: boolean },
    ): { passed: boolean; reason: string } {
        // Plan must be APPROVED
        if (config.requireApprovedPlan && plan.status !== 'APPROVED') {
            return { passed: false, reason: `Plan status is ${plan.status}, expected APPROVED` };
        }

        // Task count within limit
        if (plan.shipmentIds.length > config.maxTasksPerPlan) {
            return {
                passed: false,
                reason: `${plan.shipmentIds.length} shipments exceeds max ${config.maxTasksPerPlan}`,
            };
        }

        // Weight within limit
        const maxWeight = Number(config.maxTotalWeightKg);
        if (plan.totalWeightKg > maxWeight) {
            return {
                passed: false,
                reason: `Total weight ${plan.totalWeightKg.toFixed(1)}kg exceeds max ${maxWeight}kg`,
            };
        }

        // No empty plans
        if (plan.shipmentIds.length === 0) {
            return { passed: false, reason: 'Plan has no shipments' };
        }

        return { passed: true, reason: 'All plan constraints met' };
    }

    // ==================================================
    // INTERNAL: Gate 4 — Driver Availability + Opt-In
    // ==================================================

    private async checkDriver(
        driverId: string,
        config: { requireDriverOptIn: boolean },
    ): Promise<{ passed: boolean; reason: string }> {
        const driver = await this.prisma.driver.findUnique({
            where: { id: driverId },
            select: {
                id: true,
                status: true,
                isAvailable: true,
                autoDispatchOptIn: true,
            },
        });

        if (!driver) {
            return { passed: false, reason: `Driver ${driverId} not found` };
        }

        if (driver.status !== 'ACTIVE') {
            return { passed: false, reason: `Driver status is ${driver.status}, expected ACTIVE` };
        }

        if (!driver.isAvailable) {
            return { passed: false, reason: `Driver ${driverId} is not available` };
        }

        if (config.requireDriverOptIn && !driver.autoDispatchOptIn) {
            return { passed: false, reason: `Driver ${driverId} has not opted in to auto-dispatch` };
        }

        return { passed: true, reason: 'Driver is available and opted-in' };
    }

    // ==================================================
    // INTERNAL: Gate 5 — Exception Flags
    // ==================================================

    private async checkExceptionFlags(
        plan: RoutePlanForEvaluation,
    ): Promise<{ passed: boolean; reason: string }> {
        // Check for FAILED dispatch tasks on this route today
        const startOfDay = new Date(plan.planDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(plan.planDate);
        endOfDay.setHours(23, 59, 59, 999);

        const failedTasksToday = await this.prisma.dispatchTask.count({
            where: {
                routeId: plan.routeId,
                status: 'FAILED',
                failedAt: { gte: startOfDay, lte: endOfDay },
            },
        });

        if (failedTasksToday > 0) {
            return {
                passed: false,
                reason: `${failedTasksToday} failed dispatch task(s) on route ${plan.routeId} today`,
            };
        }

        // Check for shipments with holds (status not ready for dispatch)
        const heldShipments = await this.prisma.shipment.count({
            where: {
                id: { in: plan.shipmentIds },
                status: { in: ['CANCELLED', 'DISPUTED'] },
            },
        });

        if (heldShipments > 0) {
            return {
                passed: false,
                reason: `${heldShipments} shipment(s) have holds (cancelled or disputed)`,
            };
        }

        return { passed: true, reason: 'No exception flags detected' };
    }
}
