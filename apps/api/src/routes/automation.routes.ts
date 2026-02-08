/**
 * Automation API Routes
 *
 * Internal endpoints for the Automation Control Panel.
 * Provides status, actions log, fraud alerts, and toggle controls.
 * Protected by JWT authentication.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { requireAuth, requireRole, getAdminRole } from '../middleware/auth.middleware';

const router = Router();

// All automation routes require authentication
router.use(requireAuth);

// ==================================================
// GET /status — Module status overview
// ==================================================

router.get('/status', async (req: Request, res: Response) => {
    try {
        const [
            scanConfigs,
            pricingConfigs,
            dispatchConfigs,
            fraudAlertCounts,
            globalConfigs,
            openCircuitEvents,
        ] = await Promise.all([
            prisma.hubScanAutoValidationConfig.findMany({
                select: { hubId: true, enabled: true },
            }),
            prisma.routePricingAutoConfig.findMany({
                select: { routeId: true, enabled: true },
            }),
            prisma.hubDispatchAutoConfig.findMany({
                select: { hubId: true, enabled: true },
            }),
            prisma.fraudAlert.groupBy({
                by: ['status'],
                _count: { id: true },
            }),
            prisma.automationGlobalConfig.findMany(),
            prisma.circuitBreakerEvent.findMany({
                where: { resolvedAt: null },
                orderBy: { triggeredAt: 'desc' },
                take: 10,
            }),
        ]);

        // Build lookup from DB configs
        const globalConfigMap = new Map(globalConfigs.map(c => [c.module, c.enabled]));

        const modules = [
            {
                id: 'scan-auto-validation',
                name: 'Scan Auto-Validation',
                contract: 'S1',
                zone: 'SAFE',
                globalEnabled: globalConfigMap.has('SCAN') ? globalConfigMap.get('SCAN')! : process.env['SCAN_AUTO_VALIDATION_ENABLED'] === 'true',
                envVar: 'SCAN_AUTO_VALIDATION_ENABLED',
                configs: {
                    total: scanConfigs.length,
                    enabled: scanConfigs.filter((c: { enabled: boolean }) => c.enabled).length,
                    entityType: 'hub',
                },
            },
            {
                id: 'pricing-auto-application',
                name: 'Pricing Auto-Application',
                contract: 'G4/R1',
                zone: 'GUARDED',
                globalEnabled: globalConfigMap.has('PRICING') ? globalConfigMap.get('PRICING')! : process.env['PRICING_AUTO_APPLICATION_ENABLED'] === 'true',
                envVar: 'PRICING_AUTO_APPLICATION_ENABLED',
                configs: {
                    total: pricingConfigs.length,
                    enabled: pricingConfigs.filter((c: { enabled: boolean }) => c.enabled).length,
                    entityType: 'route',
                },
            },
            {
                id: 'dispatch-auto-execution',
                name: 'Dispatch Auto-Execution',
                contract: 'G3',
                zone: 'GUARDED',
                globalEnabled: globalConfigMap.has('DISPATCH') ? globalConfigMap.get('DISPATCH')! : process.env['DISPATCH_AUTO_EXECUTION_ENABLED'] === 'true',
                envVar: 'DISPATCH_AUTO_EXECUTION_ENABLED',
                configs: {
                    total: dispatchConfigs.length,
                    enabled: dispatchConfigs.filter((c: { enabled: boolean }) => c.enabled).length,
                    entityType: 'hub',
                },
            },
            {
                id: 'fraud-auto-response',
                name: 'Fraud Auto-Response',
                contract: 'R2',
                zone: 'RESTRICTED',
                globalEnabled: globalConfigMap.has('FRAUD') ? globalConfigMap.get('FRAUD')! : process.env['FRAUD_AUTO_RESPONSE_ENABLED'] === 'true',
                envVar: 'FRAUD_AUTO_RESPONSE_ENABLED',
                configs: {
                    total: 0,
                    enabled: 0,
                    entityType: 'global',
                },
            },
        ];

        const alertSummary: Record<string, number> = {};
        for (const row of fraudAlertCounts) {
            alertSummary[row.status] = row._count.id;
        }

        res.json({
            data: { modules, fraudAlerts: alertSummary, circuitBreakerEvents: openCircuitEvents },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch automation status');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch automation status' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// GET /actions — Recent automated actions from AuditLog
// ==================================================

router.get('/actions', async (req: Request, res: Response) => {
    try {
        const { page = '1', limit = '25' } = req.query as { page?: string; limit?: string };

        const automationActors = [
            'ai-auto-validation',
            'pricing-auto-application',
            'dispatch-auto-execution',
            'fraud-auto-response',
        ];

        const where = {
            performedById: { in: automationActors },
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

        res.json({
            data: actions,
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
                pagination: { page: parseInt(page), limit: parseInt(limit), total },
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch automation actions');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch automation actions' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// GET /fraud-alerts — Active fraud alerts
// ==================================================

router.get('/fraud-alerts', async (req: Request, res: Response) => {
    try {
        const { status, page = '1', limit = '20' } = req.query as { status?: string; page?: string; limit?: string };

        const where: Record<string, unknown> = {};
        if (status) where['status'] = status;

        const [alerts, total] = await Promise.all([
            prisma.fraudAlert.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma.fraudAlert.count({ where }),
        ]);

        res.json({
            data: alerts,
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
                pagination: { page: parseInt(page), limit: parseInt(limit), total },
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch fraud alerts');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch fraud alerts' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// POST /toggle — Toggle module on/off (runtime override)
// ==================================================

router.post('/toggle', requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
        const { moduleId, enabled } = req.body as { moduleId: string; enabled: boolean };

        if (!moduleId || typeof enabled !== 'boolean') {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'moduleId and enabled (boolean) are required' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }

        const moduleMap: Record<string, { dbModule: string; envVar: string }> = {
            'scan-auto-validation': { dbModule: 'SCAN', envVar: 'SCAN_AUTO_VALIDATION_ENABLED' },
            'pricing-auto-application': { dbModule: 'PRICING', envVar: 'PRICING_AUTO_APPLICATION_ENABLED' },
            'dispatch-auto-execution': { dbModule: 'DISPATCH', envVar: 'DISPATCH_AUTO_EXECUTION_ENABLED' },
            'fraud-auto-response': { dbModule: 'FRAUD', envVar: 'FRAUD_AUTO_RESPONSE_ENABLED' },
        };

        const mapping = moduleMap[moduleId];
        if (!mapping) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: `Unknown module: ${moduleId}` },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }

        // Persist to DB (upsert — create row if first toggle)
        await prisma.automationGlobalConfig.upsert({
            where: { module: mapping.dbModule },
            update: {
                enabled,
                reason: `Toggled by admin`,
                updatedBy: req.headers['x-user-id'] as string || 'admin',
            },
            create: {
                module: mapping.dbModule,
                enabled,
                reason: `Initial toggle by admin`,
                updatedBy: req.headers['x-user-id'] as string || 'admin',
            },
        });

        // Also update runtime env for backward compatibility
        process.env[mapping.envVar] = enabled ? 'true' : 'false';

        // Audit log
        await prisma.auditLog.create({
            data: {
                entityType: 'AUTOMATION_MODULE',
                entityId: moduleId,
                action: enabled ? 'MODULE_ENABLED' : 'MODULE_DISABLED',
                performedById: req.headers['x-user-id'] as string || 'admin',
                performedByRole: getAdminRole(req),
                changes: { dbModule: mapping.dbModule, envVar: mapping.envVar, previousValue: !enabled, newValue: enabled },
            },
        });

        logger.warn({
            audit: true,
            action: enabled ? 'MODULE_ENABLED' : 'MODULE_DISABLED',
            moduleId,
            dbModule: mapping.dbModule,
            role: getAdminRole(req),
        }, `[AUTOMATION] Module ${moduleId} ${enabled ? 'ENABLED' : 'DISABLED'} by admin (persisted to DB)`);

        res.json({
            data: { moduleId, enabled, persistent: true },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to toggle automation module');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to toggle module' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// GET /circuit-breaker/events — Recent circuit breaker events
// ==================================================

router.get('/circuit-breaker/events', async (req: Request, res: Response) => {
    try {
        const { limit = '20' } = req.query as { limit?: string };

        const events = await prisma.circuitBreakerEvent.findMany({
            orderBy: { triggeredAt: 'desc' },
            take: Math.min(parseInt(limit), 100),
        });

        res.json({
            data: events,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch circuit breaker events');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch events' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// POST /circuit-breaker/resolve — Resolve a circuit breaker event
// ==================================================

router.post('/circuit-breaker/resolve', requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
        const { eventId } = req.body as { eventId: string };

        if (!eventId) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'eventId is required' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }

        const event = await prisma.circuitBreakerEvent.update({
            where: { id: eventId },
            data: {
                resolvedAt: new Date(),
                resolvedBy: req.headers['x-user-id'] as string || 'admin',
            },
        });

        logger.info({ audit: true, eventId, resolvedBy: req.headers['x-user-id'] }, `[CIRCUIT BREAKER] Event ${eventId} resolved`);

        res.json({
            data: event,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to resolve circuit breaker event');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve event' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

export default router;
