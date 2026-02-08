/**
 * Autonomy Promotion Service
 *
 * Evaluates quantitative conditions for promoting autonomy levels:
 *   MANUAL → ASSISTED → SUPERVISED → AUTONOMOUS
 *
 * Each module (SCAN, PRICING, DISPATCH, FRAUD) can have distinct
 * promotion rules stored in `AutonomyPromotionRule`.
 *
 * Evaluation checks a sliding window of AuditLog decisions to compute:
 *   - Total decisions count
 *   - Accuracy (successful / total)
 *   - Error rate (failures / total)
 *
 * All promotions are logged to AutonomyLevelHistory + AuditLog.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

const LEVEL_ORDER = ['MANUAL', 'ASSISTED', 'SUPERVISED', 'AUTONOMOUS'] as const;
type AutonomyLevel = (typeof LEVEL_ORDER)[number];

export interface PromotionEvaluation {
    module: string;
    scopeType: string;
    scopeId: string;
    currentLevel: AutonomyLevel;
    targetLevel: AutonomyLevel | null;
    eligible: boolean;
    progress: {
        decisions: { current: number; required: number; met: boolean };
        accuracy: { current: number; required: number; met: boolean };
        errorRate: { current: number; required: number; met: boolean };
    } | null;
    reason: string;
}

interface ModuleConfig {
    id: string;
    scopeType: 'hub' | 'route' | 'global';
    actorName: string;
}

const MODULE_CONFIGS: ModuleConfig[] = [
    { id: 'scan-auto-validation', scopeType: 'hub', actorName: 'ai-auto-validation' },
    { id: 'pricing-auto-application', scopeType: 'route', actorName: 'pricing-auto-application' },
    { id: 'dispatch-auto-execution', scopeType: 'hub', actorName: 'dispatch-auto-execution' },
    { id: 'fraud-auto-response', scopeType: 'global', actorName: 'fraud-auto-response' },
];

// ──────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────

export class AutonomyPromotionService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Get current autonomy level for a module/scope from config tables.
     */
    private async getCurrentLevel(module: string, scopeId: string): Promise<AutonomyLevel> {
        const globalConfig = await (this.prisma as any).automationGlobalConfig.findUnique({
            where: { module },
        });
        const globalEnabled = globalConfig?.enabled ?? false;

        // Check per-scope config
        let entityEnabled = false;
        if (module === 'scan-auto-validation') {
            const cfg = await (this.prisma as any).hubScanAutoValidationConfig.findUnique({ where: { hubId: scopeId } });
            entityEnabled = cfg?.enabled ?? false;
        } else if (module === 'pricing-auto-application') {
            const cfg = await (this.prisma as any).routePricingAutoConfig.findUnique({ where: { routeId: scopeId } });
            entityEnabled = cfg?.enabled ?? false;
        } else if (module === 'dispatch-auto-execution') {
            const cfg = await (this.prisma as any).hubDispatchAutoConfig.findUnique({ where: { hubId: scopeId } });
            entityEnabled = cfg?.enabled ?? false;
        } else if (module === 'fraud-auto-response') {
            entityEnabled = globalEnabled; // global only
        }

        if (globalEnabled && entityEnabled) return 'AUTONOMOUS';
        if (globalEnabled && !entityEnabled) return 'SUPERVISED';
        if (!globalEnabled && entityEnabled) return 'ASSISTED';
        return 'MANUAL';
    }

    /**
     * Get the next level after current.
     */
    private getNextLevel(current: AutonomyLevel): AutonomyLevel | null {
        const idx = LEVEL_ORDER.indexOf(current);
        if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return null;
        return LEVEL_ORDER[idx + 1] ?? null;
    }

    /**
     * Compute metrics from AuditLog decisions in the sliding window.
     */
    private async computeMetrics(
        actorName: string,
        scopeId: string,
        windowDays: number,
    ): Promise<{ totalDecisions: number; successCount: number; failureCount: number; accuracy: number; errorRate: number }> {
        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() - windowDays);

        const where: Record<string, unknown> = {
            performedById: actorName,
            createdAt: { gte: windowStart },
        };

        // Scope filter (only if not global)
        if (scopeId !== 'global') {
            where['entityId'] = { contains: scopeId };
        }

        const [successCount, failureCount] = await Promise.all([
            this.prisma.auditLog.count({
                where: { ...where, action: { in: ['APPROVED', 'AUTO_APPLIED', 'EXECUTED', 'VALIDATED', 'CREATED'] } },
            }),
            this.prisma.auditLog.count({
                where: { ...where, action: { in: ['REJECTED', 'FAILED', 'ERROR', 'REQUIRE_MANUAL'] } },
            }),
        ]);

        const totalDecisions = successCount + failureCount;
        const accuracy = totalDecisions > 0 ? successCount / totalDecisions : 0;
        const errorRate = totalDecisions > 0 ? failureCount / totalDecisions : 1;

        return { totalDecisions, successCount, failureCount, accuracy, errorRate };
    }

    /**
     * Evaluate promotion eligibility for a single module/scope.
     */
    async evaluate(module: string, scopeId: string): Promise<PromotionEvaluation> {
        const moduleConfig = MODULE_CONFIGS.find(m => m.id === module);
        if (!moduleConfig) {
            return {
                module, scopeType: 'global', scopeId,
                currentLevel: 'MANUAL', targetLevel: null,
                eligible: false, progress: null,
                reason: `Unknown module: ${module}`,
            };
        }

        const currentLevel = await this.getCurrentLevel(module, scopeId);
        const targetLevel = this.getNextLevel(currentLevel);

        if (!targetLevel) {
            return {
                module, scopeType: moduleConfig.scopeType, scopeId,
                currentLevel, targetLevel: null,
                eligible: false, progress: null,
                reason: 'Already at maximum autonomy level (AUTONOMOUS)',
            };
        }

        // Fetch promotion rule for this module + target level
        const rule = await (this.prisma as any).autonomyPromotionRule.findUnique({
            where: { module_targetLevel: { module, targetLevel } },
        });

        if (!rule || !rule.active) {
            return {
                module, scopeType: moduleConfig.scopeType, scopeId,
                currentLevel, targetLevel,
                eligible: false, progress: null,
                reason: 'No active promotion rule defined for this transition',
            };
        }

        // Compute metrics
        const metrics = await this.computeMetrics(moduleConfig.actorName, scopeId, rule.windowDays);

        const progress = {
            decisions: {
                current: metrics.totalDecisions,
                required: rule.minDecisions,
                met: metrics.totalDecisions >= rule.minDecisions,
            },
            accuracy: {
                current: Math.round(metrics.accuracy * 10000) / 10000,
                required: Number(rule.minAccuracy),
                met: metrics.accuracy >= Number(rule.minAccuracy),
            },
            errorRate: {
                current: Math.round(metrics.errorRate * 10000) / 10000,
                required: Number(rule.maxErrorRate),
                met: metrics.errorRate <= Number(rule.maxErrorRate),
            },
        };

        const eligible = progress.decisions.met && progress.accuracy.met && progress.errorRate.met;

        const reasons: string[] = [];
        if (!progress.decisions.met) reasons.push(`Need ${rule.minDecisions - metrics.totalDecisions} more decisions`);
        if (!progress.accuracy.met) reasons.push(`Accuracy ${(metrics.accuracy * 100).toFixed(1)}% < ${(Number(rule.minAccuracy) * 100).toFixed(1)}%`);
        if (!progress.errorRate.met) reasons.push(`Error rate ${(metrics.errorRate * 100).toFixed(1)}% > ${(Number(rule.maxErrorRate) * 100).toFixed(1)}%`);

        return {
            module,
            scopeType: moduleConfig.scopeType,
            scopeId,
            currentLevel,
            targetLevel,
            eligible,
            progress,
            reason: eligible ? 'All conditions met — eligible for promotion' : reasons.join('; '),
        };
    }

    /**
     * Evaluate all modules across all scopes.
     */
    async evaluateAll(): Promise<PromotionEvaluation[]> {
        const results: PromotionEvaluation[] = [];

        // Fetch all hubs and routes
        const [hubs, routes] = await Promise.all([
            this.prisma.hub.findMany({ select: { id: true } }),
            this.prisma.route.findMany({ select: { id: true } }),
        ]);

        for (const moduleConfig of MODULE_CONFIGS) {
            if (moduleConfig.scopeType === 'hub') {
                for (const hub of hubs) {
                    results.push(await this.evaluate(moduleConfig.id, hub.id));
                }
            } else if (moduleConfig.scopeType === 'route') {
                for (const route of routes) {
                    results.push(await this.evaluate(moduleConfig.id, route.id));
                }
            } else {
                results.push(await this.evaluate(moduleConfig.id, 'global'));
            }
        }

        return results;
    }

    /**
     * Execute a promotion (admin-triggered or system-triggered).
     */
    async promote(
        module: string,
        scopeId: string,
        promotedBy: string = 'SYSTEM',
    ): Promise<{ success: boolean; message: string }> {
        const evaluation = await this.evaluate(module, scopeId);

        if (!evaluation.eligible) {
            return { success: false, message: `Not eligible: ${evaluation.reason}` };
        }

        if (!evaluation.targetLevel) {
            return { success: false, message: 'Already at maximum level' };
        }

        // Record history
        await (this.prisma as any).autonomyLevelHistory.create({
            data: {
                module,
                scopeType: evaluation.scopeType,
                scopeId,
                previousLevel: evaluation.currentLevel,
                newLevel: evaluation.targetLevel,
                reason: evaluation.reason,
                metrics: evaluation.progress,
                promotedBy,
            },
        });

        // Apply the promotion by enabling configs
        try {
            if (evaluation.targetLevel === 'AUTONOMOUS' || evaluation.targetLevel === 'SUPERVISED') {
                // Enable global
                await (this.prisma as any).automationGlobalConfig.upsert({
                    where: { module },
                    create: { module, enabled: true },
                    update: { enabled: true },
                });
            }

            if (evaluation.targetLevel === 'AUTONOMOUS' || evaluation.targetLevel === 'ASSISTED') {
                // Enable per-scope
                if (module === 'scan-auto-validation') {
                    await (this.prisma as any).hubScanAutoValidationConfig.upsert({
                        where: { hubId: scopeId },
                        create: { hubId: scopeId, enabled: true },
                        update: { enabled: true },
                    });
                } else if (module === 'pricing-auto-application') {
                    await (this.prisma as any).routePricingAutoConfig.upsert({
                        where: { routeId: scopeId },
                        create: { routeId: scopeId, enabled: true },
                        update: { enabled: true },
                    });
                } else if (module === 'dispatch-auto-execution') {
                    await (this.prisma as any).hubDispatchAutoConfig.upsert({
                        where: { hubId: scopeId },
                        create: { hubId: scopeId, enabled: true },
                        update: { enabled: true },
                    });
                }
            }
        } catch (error) {
            logger.error({ error, module, scopeId }, 'Failed to apply promotion config');
            return { success: false, message: 'Promotion recorded but config update failed' };
        }

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                entityType: 'AUTONOMY_LEVEL',
                entityId: `${module}:${scopeId}`,
                action: 'PROMOTED',
                performedById: promotedBy,
                performedByRole: promotedBy === 'SYSTEM' ? 'SYSTEM' : 'ADMIN',
                changes: {
                    module,
                    scopeId,
                    from: evaluation.currentLevel,
                    to: evaluation.targetLevel,
                    metrics: evaluation.progress,
                },
            },
        });

        logger.info(
            { module, scopeId, from: evaluation.currentLevel, to: evaluation.targetLevel, promotedBy },
            'Autonomy level promoted',
        );

        return {
            success: true,
            message: `Promoted ${module} (${scopeId}) from ${evaluation.currentLevel} → ${evaluation.targetLevel}`,
        };
    }
}

// ──────────────────────────────────────────────────
// Singleton
// ──────────────────────────────────────────────────

let _instance: AutonomyPromotionService | null = null;

export function getAutonomyPromotionService(prisma: PrismaClient): AutonomyPromotionService {
    if (!_instance) {
        _instance = new AutonomyPromotionService(prisma);
    }
    return _instance;
}
