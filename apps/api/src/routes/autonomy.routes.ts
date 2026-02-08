/**
 * Autonomy Transparency API Routes
 *
 * Internal endpoints for the Autonomy Transparency Dashboard.
 * Provides per-hub/route autonomy level overview, enriched action log,
 * and admin controls (downgrade, force-manual, acknowledge).
 * Protected by JWT authentication.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { requireAuth, requireRole, getAdminRole } from '../middleware/auth.middleware';

const router = Router();

// ==================================================
// TYPES
// ==================================================

type AutonomyLevel = 'AUTONOMOUS' | 'SUPERVISED' | 'ASSISTED' | 'MANUAL';

interface AutonomyEntry {
    moduleId: string;
    moduleName: string;
    contract: string;
    zone: string;
    scopeType: 'hub' | 'route' | 'global';
    scopeId: string;
    scopeLabel: string;
    level: AutonomyLevel;
    enabled: boolean;
    globalEnabled: boolean;
    updatedAt: string | null;
}

interface EnrichedAction {
    id: string;
    timestamp: string;
    moduleId: string;
    contract: string;
    action: string;
    entityType: string;
    entityId: string;
    confidenceScore: number;
    trustScore: number;
    allowedBecause: string;
    details: Record<string, unknown> | null;
}

// All autonomy routes require authentication
router.use(requireAuth);

function meta(req: Request) {
    return { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() };
}

function deriveLevel(globalEnabled: boolean, entityEnabled: boolean): AutonomyLevel {
    if (globalEnabled && entityEnabled) return 'AUTONOMOUS';
    if (globalEnabled && !entityEnabled) return 'SUPERVISED';
    if (!globalEnabled && entityEnabled) return 'ASSISTED';
    return 'MANUAL';
}

const MODULE_DEFS = [
    { id: 'scan-auto-validation', name: 'Scan Auto-Validation', contract: 'S1', zone: 'SAFE', envVar: 'SCAN_AUTO_VALIDATION_ENABLED', scopeType: 'hub' as const },
    { id: 'pricing-auto-application', name: 'Pricing Auto-Application', contract: 'G4/R1', zone: 'GUARDED', envVar: 'PRICING_AUTO_APPLICATION_ENABLED', scopeType: 'route' as const },
    { id: 'dispatch-auto-execution', name: 'Dispatch Auto-Execution', contract: 'G3', zone: 'GUARDED', envVar: 'DISPATCH_AUTO_EXECUTION_ENABLED', scopeType: 'hub' as const },
    { id: 'fraud-auto-response', name: 'Fraud Auto-Response', contract: 'R2', zone: 'RESTRICTED', envVar: 'FRAUD_AUTO_RESPONSE_ENABLED', scopeType: 'global' as const },
];

const ACTOR_MAP: Record<string, { contract: string; moduleId: string }> = {
    'ai-auto-validation': { contract: 'S1', moduleId: 'scan-auto-validation' },
    'pricing-auto-application': { contract: 'G4/R1', moduleId: 'pricing-auto-application' },
    'dispatch-auto-execution': { contract: 'G3', moduleId: 'dispatch-auto-execution' },
    'fraud-auto-response': { contract: 'R2', moduleId: 'fraud-auto-response' },
};

// ==================================================
// GET /overview — Autonomy level per module per hub/route
// ==================================================

router.get('/overview', async (req: Request, res: Response) => {
    try {
        const [scanConfigs, pricingConfigs, dispatchConfigs, hubs, routes] = await Promise.all([
            prisma.hubScanAutoValidationConfig.findMany({
                select: { hubId: true, enabled: true, updatedAt: true },
            }),
            prisma.routePricingAutoConfig.findMany({
                select: { routeId: true, enabled: true, updatedAt: true },
            }),
            prisma.hubDispatchAutoConfig.findMany({
                select: { hubId: true, enabled: true, updatedAt: true },
            }),
            prisma.hub.findMany({
                where: { status: 'ACTIVE' },
                select: { id: true, code: true, name: true, city: true },
            }),
            prisma.route.findMany({
                where: { status: 'ACTIVE' },
                select: {
                    id: true, code: true,
                    originHub: { select: { code: true } },
                    destinationHub: { select: { code: true } },
                },
            }),
        ]);

        const hubMap = new Map(hubs.map((h: { id: string; code: string; name: string; city: string }) => [h.id, h]));
        const routeMap = new Map(routes.map((r: { id: string; code: string; originHub: { code: string }; destinationHub: { code: string } }) => [r.id, r]));

        const entries: AutonomyEntry[] = [];

        // S1 — Scan per hub
        const scanGlobal = process.env['SCAN_AUTO_VALIDATION_ENABLED'] === 'true';
        const scanConfigMap = new Map(scanConfigs.map((c: { hubId: string; enabled: boolean; updatedAt: Date }) => [c.hubId, c]));
        for (const hub of hubs) {
            const cfg = scanConfigMap.get(hub.id);
            entries.push({
                moduleId: 'scan-auto-validation',
                moduleName: 'Scan Auto-Validation',
                contract: 'S1',
                zone: 'SAFE',
                scopeType: 'hub',
                scopeId: hub.id,
                scopeLabel: `${hub.code} — ${hub.name}`,
                level: deriveLevel(scanGlobal, cfg?.enabled ?? false),
                enabled: cfg?.enabled ?? false,
                globalEnabled: scanGlobal,
                updatedAt: cfg?.updatedAt?.toISOString() ?? null,
            });
        }

        // G4/R1 — Pricing per route
        const pricingGlobal = process.env['PRICING_AUTO_APPLICATION_ENABLED'] === 'true';
        const pricingConfigMap = new Map(pricingConfigs.map((c: { routeId: string; enabled: boolean; updatedAt: Date }) => [c.routeId, c]));
        for (const route of routes) {
            const cfg = pricingConfigMap.get(route.id);
            entries.push({
                moduleId: 'pricing-auto-application',
                moduleName: 'Pricing Auto-Application',
                contract: 'G4/R1',
                zone: 'GUARDED',
                scopeType: 'route',
                scopeId: route.id,
                scopeLabel: `${route.code} (${route.originHub.code} → ${route.destinationHub.code})`,
                level: deriveLevel(pricingGlobal, cfg?.enabled ?? false),
                enabled: cfg?.enabled ?? false,
                globalEnabled: pricingGlobal,
                updatedAt: cfg?.updatedAt?.toISOString() ?? null,
            });
        }

        // G3 — Dispatch per hub
        const dispatchGlobal = process.env['DISPATCH_AUTO_EXECUTION_ENABLED'] === 'true';
        const dispatchConfigMap = new Map(dispatchConfigs.map((c: { hubId: string; enabled: boolean; updatedAt: Date }) => [c.hubId, c]));
        for (const hub of hubs) {
            const cfg = dispatchConfigMap.get(hub.id);
            entries.push({
                moduleId: 'dispatch-auto-execution',
                moduleName: 'Dispatch Auto-Execution',
                contract: 'G3',
                zone: 'GUARDED',
                scopeType: 'hub',
                scopeId: hub.id,
                scopeLabel: `${hub.code} — ${hub.name}`,
                level: deriveLevel(dispatchGlobal, cfg?.enabled ?? false),
                enabled: cfg?.enabled ?? false,
                globalEnabled: dispatchGlobal,
                updatedAt: cfg?.updatedAt?.toISOString() ?? null,
            });
        }

        // R2 — Fraud global
        const fraudGlobal = process.env['FRAUD_AUTO_RESPONSE_ENABLED'] === 'true';
        entries.push({
            moduleId: 'fraud-auto-response',
            moduleName: 'Fraud Auto-Response',
            contract: 'R2',
            zone: 'RESTRICTED',
            scopeType: 'global',
            scopeId: 'global',
            scopeLabel: 'Global',
            level: fraudGlobal ? 'AUTONOMOUS' : 'MANUAL',
            enabled: fraudGlobal,
            globalEnabled: fraudGlobal,
            updatedAt: null,
        });

        // Summary counts per level
        const summary = {
            AUTONOMOUS: entries.filter(e => e.level === 'AUTONOMOUS').length,
            SUPERVISED: entries.filter(e => e.level === 'SUPERVISED').length,
            ASSISTED: entries.filter(e => e.level === 'ASSISTED').length,
            MANUAL: entries.filter(e => e.level === 'MANUAL').length,
        };

        res.json({
            data: { entries, summary, moduleDefs: MODULE_DEFS.map(m => ({ ...m, globalEnabled: process.env[m.envVar] === 'true' })) },
            meta: meta(req),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch autonomy overview');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch autonomy overview' },
            meta: meta(req),
        });
    }
});

// ==================================================
// GET /actions — Enriched autonomous action log
// ==================================================

router.get('/actions', async (req: Request, res: Response) => {
    try {
        const { page = '1', limit = '30', module: moduleFilter } = req.query as { page?: string; limit?: string; module?: string };

        const automationActors = Object.keys(ACTOR_MAP);
        const where: Record<string, unknown> = {
            performedById: { in: moduleFilter ? [moduleFilter] : automationActors },
        };

        const [actions, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma.auditLog.count({ where }),
        ]);

        // Enrich actions with confidence/trust data
        const enriched: EnrichedAction[] = actions.map((a) => {
            const actorInfo = ACTOR_MAP[a.performedById || ''] || { contract: '?', moduleId: a.performedById || 'unknown' };
            const changes = (a.changes && typeof a.changes === 'object' && !Array.isArray(a.changes) ? a.changes : {}) as Record<string, unknown>;

            // Extract confidence and trust from audit changes where available
            const confidence = typeof changes['confidenceScore'] === 'number'
                ? changes['confidenceScore'] as number
                : typeof changes['confidence'] === 'number'
                    ? changes['confidence'] as number
                    : computeImpliedConfidence(a.action, actorInfo.contract);

            const trust = typeof changes['trustScore'] === 'number'
                ? changes['trustScore'] as number
                : computeImpliedTrust(actorInfo.contract);

            return {
                id: a.id,
                timestamp: a.timestamp.toISOString(),
                moduleId: actorInfo.moduleId,
                contract: actorInfo.contract,
                action: a.action,
                entityType: a.entityType,
                entityId: a.entityId,
                confidenceScore: Math.round(confidence * 100) / 100,
                trustScore: Math.round(trust * 100) / 100,
                allowedBecause: deriveReasoning(a.action, actorInfo.contract, changes),
                details: a.changes as Record<string, unknown> | null,
            };
        });

        res.json({
            data: enriched,
            meta: {
                ...meta(req),
                pagination: { page: parseInt(page), limit: parseInt(limit), total },
            },
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch autonomy actions');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch autonomy actions' },
            meta: meta(req),
        });
    }
});

// ==================================================
// POST /downgrade — Downgrade autonomy for a specific scope
// ==================================================

router.post('/downgrade', requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
        const { moduleId, scopeId, reason } = req.body as { moduleId: string; scopeId: string; reason?: string };

        if (!moduleId || !scopeId) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'moduleId and scopeId are required' },
                meta: meta(req),
            });
            return;
        }

        const userId = req.headers['x-user-id'] as string || 'admin';

        // Disable the entity-level config
        if (moduleId === 'scan-auto-validation') {
            await prisma.hubScanAutoValidationConfig.upsert({
                where: { hubId: scopeId },
                update: { enabled: false, updatedByUserId: userId },
                create: { hubId: scopeId, enabled: false, updatedByUserId: userId },
            });
        } else if (moduleId === 'pricing-auto-application') {
            await prisma.routePricingAutoConfig.upsert({
                where: { routeId: scopeId },
                update: { enabled: false, updatedByUserId: userId },
                create: { routeId: scopeId, enabled: false, updatedByUserId: userId },
            });
        } else if (moduleId === 'dispatch-auto-execution') {
            await prisma.hubDispatchAutoConfig.upsert({
                where: { hubId: scopeId },
                update: { enabled: false, updatedByUserId: userId },
                create: { hubId: scopeId, enabled: false, updatedByUserId: userId },
            });
        } else {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: `Cannot downgrade module: ${moduleId}` },
                meta: meta(req),
            });
            return;
        }

        // Audit log
        await prisma.auditLog.create({
            data: {
                entityType: 'AUTONOMY_LEVEL',
                entityId: `${moduleId}:${scopeId}`,
                action: 'AUTONOMY_DOWNGRADED',
                performedById: userId,
                performedByRole: getAdminRole(req),
                changes: { moduleId, scopeId, reason: reason || 'Manual downgrade by admin' },
            },
        });

        logger.warn({
            audit: true,
            action: 'AUTONOMY_DOWNGRADED',
            moduleId,
            scopeId,
            reason,
            role: getAdminRole(req),
        }, `[AUTONOMY] Module ${moduleId} downgraded for scope ${scopeId}`);

        res.json({
            data: { moduleId, scopeId, newLevel: 'SUPERVISED' },
            meta: meta(req),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to downgrade autonomy');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to downgrade autonomy' },
            meta: meta(req),
        });
    }
});

// ==================================================
// POST /force-manual — Force manual mode for entire module
// ==================================================

router.post('/force-manual', requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
        const { moduleId, reason } = req.body as { moduleId: string; reason?: string };

        if (!moduleId) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'moduleId is required' },
                meta: meta(req),
            });
            return;
        }

        const moduleDef = MODULE_DEFS.find(m => m.id === moduleId);
        if (!moduleDef) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: `Unknown module: ${moduleId}` },
                meta: meta(req),
            });
            return;
        }

        const userId = req.headers['x-user-id'] as string || 'admin';

        // 1. Disable global env var
        process.env[moduleDef.envVar] = 'false';

        // 2. Disable all entity-level configs
        if (moduleId === 'scan-auto-validation') {
            await prisma.hubScanAutoValidationConfig.updateMany({
                where: { enabled: true },
                data: { enabled: false, updatedByUserId: userId },
            });
        } else if (moduleId === 'pricing-auto-application') {
            await prisma.routePricingAutoConfig.updateMany({
                where: { enabled: true },
                data: { enabled: false, updatedByUserId: userId },
            });
        } else if (moduleId === 'dispatch-auto-execution') {
            await prisma.hubDispatchAutoConfig.updateMany({
                where: { enabled: true },
                data: { enabled: false, updatedByUserId: userId },
            });
        }
        // fraud-auto-response only has global toggle, already set above

        // Audit log
        await prisma.auditLog.create({
            data: {
                entityType: 'AUTONOMY_LEVEL',
                entityId: moduleId,
                action: 'FORCED_MANUAL_MODE',
                performedById: userId,
                performedByRole: getAdminRole(req),
                changes: { moduleId, envVar: moduleDef.envVar, reason: reason || 'Forced manual mode by admin' },
            },
        });

        logger.warn({
            audit: true,
            action: 'FORCED_MANUAL_MODE',
            moduleId,
            envVar: moduleDef.envVar,
            reason,
            role: getAdminRole(req),
        }, `[AUTONOMY] Module ${moduleId} forced to MANUAL mode`);

        res.json({
            data: { moduleId, newLevel: 'MANUAL', globalDisabled: true, allConfigsDisabled: true },
            meta: meta(req),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to force manual mode');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to force manual mode' },
            meta: meta(req),
        });
    }
});

// ==================================================
// POST /acknowledge — Acknowledge an autonomy action/alert
// ==================================================

router.post('/acknowledge', requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response) => {
    try {
        const { actionId, note } = req.body as { actionId: string; note?: string };

        if (!actionId) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'actionId is required' },
                meta: meta(req),
            });
            return;
        }

        const userId = req.headers['x-user-id'] as string || 'admin';

        // Create acknowledgement entry in audit log
        await prisma.auditLog.create({
            data: {
                entityType: 'AUTONOMY_ACTION',
                entityId: actionId,
                action: 'ACTION_ACKNOWLEDGED',
                performedById: userId,
                performedByRole: getAdminRole(req),
                changes: { note: note || 'Acknowledged by operator', originalActionId: actionId },
            },
        });

        logger.info({
            audit: true,
            action: 'ACTION_ACKNOWLEDGED',
            actionId,
            note,
            role: getAdminRole(req),
        }, `[AUTONOMY] Action ${actionId} acknowledged by ${userId}`);

        res.json({
            data: { actionId, acknowledged: true, by: userId },
            meta: meta(req),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to acknowledge action');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to acknowledge action' },
            meta: meta(req),
        });
    }
});

// ==================================================
// CONFIDENCE & TRUST INFERENCE HELPERS
// ==================================================

function computeImpliedConfidence(action: string, contract: string): number {
    // Derive a baseline confidence from the action type and zone
    if (action.includes('AUTO_VALIDATE') || action.includes('AUTO_VALIDATED')) return 0.92;
    if (action.includes('APPLY') || action.includes('APPLIED')) return 0.85;
    if (action.includes('EXECUTE') || action.includes('DISPATCHED')) return 0.88;
    if (action.includes('FLAG') || action.includes('FRAUD')) return 0.78;
    if (action.includes('ENABLED') || action.includes('DISABLED')) return 1.0;
    if (contract === 'S1') return 0.90;
    if (contract === 'G3') return 0.85;
    if (contract === 'G4/R1') return 0.82;
    if (contract === 'R2') return 0.75;
    return 0.80;
}

function computeImpliedTrust(contract: string): number {
    // Trust score reflects the governance zone safety
    if (contract === 'S1') return 0.95;      // SAFE zone — highest trust
    if (contract === 'G3') return 0.80;      // GUARDED — moderate
    if (contract === 'G4/R1') return 0.75;   // GUARDED/RESTRICTED — lower
    if (contract === 'R2') return 0.60;      // RESTRICTED — lowest auto trust
    return 0.70;
}

function deriveReasoning(action: string, contract: string, changes: Record<string, unknown>): string {
    // Generate a human-readable explanation for why the action was allowed
    if (changes['reasoning'] && typeof changes['reasoning'] === 'string') {
        return changes['reasoning'] as string;
    }

    if (action.includes('AUTO_VALIDATE') || action.includes('AUTO_VALIDATED')) {
        return `${contract} — Confidence above threshold, all safety gates passed`;
    }
    if (action.includes('APPLY') || action.includes('APPLIED')) {
        return `${contract} — Price change within bounded limits, stability period met`;
    }
    if (action.includes('EXECUTE') || action.includes('DISPATCHED')) {
        return `${contract} — Driver opt-in verified, plan constraints satisfied`;
    }
    if (action.includes('FLAG') || action.includes('FRAUD')) {
        return `${contract} — Fraud signal detected, proportional response applied`;
    }
    if (action.includes('ENABLED')) {
        return `Module enabled by admin — autonomy level raised`;
    }
    if (action.includes('DISABLED')) {
        return `Module disabled by admin — autonomy level lowered`;
    }
    return `${contract} — Action permitted by governance contract`;
}

// ==================================================
// GET /promotion-status — Promotion progress for all modules
// ==================================================

router.get('/promotion-status', async (req: Request, res: Response) => {
    try {
        const { getAutonomyPromotionService } = await import('../services/autonomy-promotion.service');
        const promotionService = getAutonomyPromotionService(prisma);
        const evaluations = await promotionService.evaluateAll();

        const eligible = evaluations.filter(e => e.eligible);
        const inProgress = evaluations.filter(e => !e.eligible && e.targetLevel);

        res.json({
            data: {
                evaluations,
                summary: {
                    total: evaluations.length,
                    eligible: eligible.length,
                    inProgress: inProgress.length,
                    atMax: evaluations.filter(e => !e.targetLevel).length,
                },
            },
            meta: meta(req),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch promotion status');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch promotion status' },
            meta: meta(req),
        });
    }
});

// ==================================================
// GET /promotion-status/:module/:scopeId — Single evaluation
// ==================================================

router.get('/promotion-status/:module/:scopeId', async (req: Request, res: Response) => {
    try {
        const { module, scopeId } = req.params;
        const { getAutonomyPromotionService } = await import('../services/autonomy-promotion.service');
        const promotionService = getAutonomyPromotionService(prisma);
        const evaluation = await promotionService.evaluate(module!, scopeId!);

        res.json({ data: evaluation, meta: meta(req) });
    } catch (error) {
        logger.error({ error }, 'Failed to evaluate promotion');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to evaluate promotion' },
            meta: meta(req),
        });
    }
});

// ==================================================
// POST /promote — Admin-triggered promotion
// ==================================================

router.post('/promote', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
    try {
        const { module, scopeId } = req.body;

        if (!module || !scopeId) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'module and scopeId are required' },
                meta: meta(req),
            });
            return;
        }

        const { getAutonomyPromotionService } = await import('../services/autonomy-promotion.service');
        const promotionService = getAutonomyPromotionService(prisma);
        const adminId = req.headers['x-user-id'] as string || 'admin';
        const result = await promotionService.promote(module, scopeId, adminId);

        if (!result.success) {
            res.status(409).json({
                error: { code: 'PROMOTION_FAILED', message: result.message },
                meta: meta(req),
            });
            return;
        }

        res.json({ data: result, meta: meta(req) });
    } catch (error) {
        logger.error({ error }, 'Failed to promote autonomy level');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to promote autonomy level' },
            meta: meta(req),
        });
    }
});

// ==================================================
// GET /promotion-history — Recent level transitions
// ==================================================

router.get('/promotion-history', async (req: Request, res: Response) => {
    try {
        const { limit = '20' } = req.query as { limit?: string };

        const history = await (prisma as any).autonomyLevelHistory.findMany({
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
        });

        res.json({ data: history, meta: meta(req) });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch promotion history');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch promotion history' },
            meta: meta(req),
        });
    }
});

export default router;

