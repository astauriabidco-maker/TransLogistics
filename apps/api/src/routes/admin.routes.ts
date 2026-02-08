/**
 * Admin API Routes
 * 
 * Internal operations endpoints for managing logistics.
 * Protected by JWT authentication — requires Bearer token.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { requireAuth, requireRole, getAdminRole } from '../middleware/auth.middleware';

const router = Router();

// ==================================================
// TYPES
// ==================================================

interface FilterParams {
    hubId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    limit?: string;
}

// All admin routes require authentication
router.use(requireAuth);

// ==================================================
// HELPER
// ==================================================

function meta(req: Request) {
    return { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() };
}

// ==================================================
// HUBS — FULL CRUD
// ==================================================

const HUB_STATUS_TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['ACTIVE'],
    ACTIVE: ['SUSPENDED', 'CLOSED'],
    SUSPENDED: ['ACTIVE', 'CLOSED'],
    CLOSED: [],
};

/**
 * GET /admin/hubs — List hubs with pagination, status filter, search
 */
router.get('/hubs', async (req: Request, res: Response) => {
    try {
        const { status, page = '1', limit = '20' } = req.query as FilterParams;
        const search = req.query['search'] as string | undefined;

        const where: Record<string, unknown> = {};
        if (status) where['status'] = status;
        if (search) {
            where['OR'] = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [hubs, total] = await Promise.all([
            prisma.hub.findMany({
                where,
                orderBy: { name: 'asc' },
                skip,
                take,
                include: {
                    _count: {
                        select: {
                            users: true,
                            drivers: true,
                            routesAsOrigin: true,
                            vehicles: true,
                        },
                    },
                },
            }),
            prisma.hub.count({ where }),
        ]);

        res.json({
            data: hubs,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / take) },
            meta: meta(req),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch hubs');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch hubs' }, meta: meta(req) });
    }
});

/**
 * GET /admin/hubs/:id — Single hub with relations
 */
router.get('/hubs/:id', async (req: Request, res: Response) => {
    try {
        const hub = await prisma.hub.findUnique({
            where: { id: req.params['id'] },
            include: {
                _count: {
                    select: { users: true, drivers: true, routesAsOrigin: true, routesAsDestination: true, vehicles: true, routePlans: true },
                },
            },
        });

        if (!hub) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Hub not found' }, meta: meta(req) });
            return;
        }

        res.json({ data: hub, meta: meta(req) });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch hub');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch hub' }, meta: meta(req) });
    }
});

/**
 * POST /admin/hubs — Create hub (SUPER_ADMIN only)
 */
router.post('/hubs', requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
    try {
        const { code, name, addressLine1, addressLine2, city, region, country, postalCode, latitude, longitude, timezone, openingTime, closingTime, maxDailyCapacity } = req.body;

        if (!code || !name || !addressLine1 || !city || !region || latitude == null || longitude == null) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: code, name, addressLine1, city, region, latitude, longitude' }, meta: meta(req) });
            return;
        }

        const existing = await prisma.hub.findUnique({ where: { code } });
        if (existing) {
            res.status(409).json({ error: { code: 'CONFLICT', message: `Hub with code "${code}" already exists` }, meta: meta(req) });
            return;
        }

        const hub = await prisma.hub.create({
            data: {
                code: code.toUpperCase(),
                name,
                addressLine1,
                addressLine2,
                city,
                region,
                country: country || 'CI',
                postalCode,
                latitude,
                longitude,
                timezone: timezone || 'Africa/Abidjan',
                openingTime: openingTime || '08:00',
                closingTime: closingTime || '18:00',
                maxDailyCapacity: maxDailyCapacity || 100,
                status: 'DRAFT',
            },
        });

        logger.info({ hubId: hub.id, code: hub.code, userId: req.user?.id }, 'Hub created');
        res.status(201).json({ data: hub, meta: meta(req) });
    } catch (error) {
        logger.error({ error }, 'Failed to create hub');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create hub' }, meta: meta(req) });
    }
});

/**
 * PUT /admin/hubs/:id — Update hub
 */
router.put('/hubs/:id', requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
    try {
        const hub = await prisma.hub.findUnique({ where: { id: req.params['id'] } });
        if (!hub) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Hub not found' }, meta: meta(req) });
            return;
        }

        const { name, addressLine1, addressLine2, city, region, country, postalCode, latitude, longitude, timezone, openingTime, closingTime, maxDailyCapacity } = req.body;

        const updated = await prisma.hub.update({
            where: { id: req.params['id'] },
            data: {
                ...(name && { name }),
                ...(addressLine1 && { addressLine1 }),
                ...(addressLine2 !== undefined && { addressLine2 }),
                ...(city && { city }),
                ...(region && { region }),
                ...(country && { country }),
                ...(postalCode !== undefined && { postalCode }),
                ...(latitude != null && { latitude }),
                ...(longitude != null && { longitude }),
                ...(timezone && { timezone }),
                ...(openingTime && { openingTime }),
                ...(closingTime && { closingTime }),
                ...(maxDailyCapacity != null && { maxDailyCapacity }),
            },
        });

        logger.info({ hubId: updated.id, userId: req.user?.id }, 'Hub updated');
        res.json({ data: updated, meta: meta(req) });
    } catch (error) {
        logger.error({ error }, 'Failed to update hub');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update hub' }, meta: meta(req) });
    }
});

/**
 * PATCH /admin/hubs/:id/status — Transition hub status (SUPER_ADMIN only)
 */
router.patch('/hubs/:id/status', requireRole('SUPER_ADMIN'), async (req: Request, res: Response) => {
    try {
        const hub = await prisma.hub.findUnique({ where: { id: req.params['id'] } });
        if (!hub) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Hub not found' }, meta: meta(req) });
            return;
        }

        const { status } = req.body;
        if (!status) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'status is required' }, meta: meta(req) });
            return;
        }

        const allowed = HUB_STATUS_TRANSITIONS[hub.status] || [];
        if (!allowed.includes(status)) {
            res.status(422).json({
                error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${hub.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}` },
                meta: meta(req),
            });
            return;
        }

        const updated = await prisma.hub.update({
            where: { id: req.params['id'] },
            data: {
                status,
                ...(status === 'ACTIVE' && { activatedAt: new Date() }),
                ...(status === 'CLOSED' && { closedAt: new Date() }),
            },
        });

        logger.info({ hubId: updated.id, from: hub.status, to: status, userId: req.user?.id }, 'Hub status transitioned');
        res.json({ data: updated, allowedTransitions: HUB_STATUS_TRANSITIONS[status] || [], meta: meta(req) });
    } catch (error) {
        logger.error({ error }, 'Failed to transition hub status');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to transition hub status' }, meta: meta(req) });
    }
});

// ==================================================
// QUOTES
// ==================================================

router.get('/quotes', async (req: Request, res: Response) => {
    try {
        const { status, startDate, endDate, page = '1', limit = '20' } = req.query as FilterParams;

        const where: Record<string, unknown> = {};
        if (status) where['status'] = status;
        if (startDate || endDate) {
            where['createdAt'] = {};
            if (startDate) (where['createdAt'] as Record<string, unknown>)['gte'] = new Date(startDate);
            if (endDate) (where['createdAt'] as Record<string, unknown>)['lte'] = new Date(endDate);
        }

        const [quotes, total] = await Promise.all([
            prisma.quote.findMany({
                where,
                include: {
                    shipment: { select: { trackingCode: true, customerId: true } },
                    pricingRule: { select: { id: true, version: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma.quote.count({ where }),
        ]);

        res.json({
            data: quotes,
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
                pagination: { page: parseInt(page), limit: parseInt(limit), total },
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch quotes');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch quotes' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// SHIPMENTS
// ==================================================

router.get('/shipments', async (req: Request, res: Response) => {
    try {
        const { hubId, status, startDate, endDate, page = '1', limit = '20' } = req.query as FilterParams;

        const where: Record<string, unknown> = {};
        if (status) where['status'] = status;
        if (hubId) {
            where['route'] = {
                OR: [{ originHubId: hubId }, { destinationHubId: hubId }]
            };
        }
        if (startDate || endDate) {
            where['createdAt'] = {};
            if (startDate) (where['createdAt'] as Record<string, unknown>)['gte'] = new Date(startDate);
            if (endDate) (where['createdAt'] as Record<string, unknown>)['lte'] = new Date(endDate);
        }

        const [shipments, total] = await Promise.all([
            prisma.shipment.findMany({
                where,
                include: {
                    customer: { select: { firstName: true, lastName: true, phone: true } },
                    route: {
                        include: {
                            originHub: { select: { code: true, name: true } },
                            destinationHub: { select: { code: true, name: true } },
                        }
                    },
                    quote: { select: { totalPriceXof: true, status: true } },
                    payment: { select: { status: true, amountXof: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma.shipment.count({ where }),
        ]);

        res.json({
            data: shipments,
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
                pagination: { page: parseInt(page), limit: parseInt(limit), total },
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch shipments');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch shipments' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

router.patch('/shipments/:id/status', requireRole('OPERATOR', 'ADMIN'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;

        if (!status) {
            return res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'Status is required' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
        }

        const shipment = await prisma.shipment.update({
            where: { id },
            data: { status },
        });

        logger.info({ shipmentId: id, newStatus: status, reason, role: getAdminRole(req) }, 'Shipment status updated');

        res.json({
            data: shipment,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to update shipment status');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to update shipment' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// SCANS
// ==================================================

router.get('/scans', async (req: Request, res: Response) => {
    try {
        const { hubId, status, startDate, endDate, page = '1', limit = '20' } = req.query as FilterParams;

        const where: Record<string, unknown> = {};
        if (status) where['status'] = status;
        if (startDate || endDate) {
            where['createdAt'] = {};
            if (startDate) (where['createdAt'] as Record<string, unknown>)['gte'] = new Date(startDate);
            if (endDate) (where['createdAt'] as Record<string, unknown>)['lte'] = new Date(endDate);
        }

        const [scans, total] = await Promise.all([
            prisma.scanResult.findMany({
                where,
                include: {
                    shipment: {
                        select: {
                            trackingCode: true,
                            route: {
                                include: {
                                    originHub: { select: { code: true } },
                                    destinationHub: { select: { code: true } },
                                }
                            }
                        }
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma.scanResult.count({ where }),
        ]);

        res.json({
            data: scans,
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
                pagination: { page: parseInt(page), limit: parseInt(limit), total },
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch scans');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch scans' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

router.post('/scans/:id/validate', requireRole('OPERATOR', 'ADMIN'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const scan = await prisma.scanResult.update({
            where: { id },
            data: { status: 'VALIDATED' },
        });

        logger.info({ scanId: id, role: getAdminRole(req) }, 'Scan manually validated');

        res.json({
            data: scan,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to validate scan');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to validate scan' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

router.post('/scans/:id/override', requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { lengthCm, widthCm, heightCm, reason } = req.body;

        if (!reason) {
            return res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'Override reason is required' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
        }

        const scan = await prisma.scanResult.update({
            where: { id },
            data: {
                detectedLengthCm: lengthCm,
                detectedWidthCm: widthCm,
                detectedHeightCm: heightCm,
                status: 'OVERRIDDEN',
                overrideReason: reason,
            },
        });

        logger.info({ scanId: id, reason, role: getAdminRole(req) }, 'Scan overridden by admin');

        res.json({
            data: scan,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to override scan');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to override scan' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// PAYMENTS
// ==================================================

router.get('/payments', async (req: Request, res: Response) => {
    try {
        const { status, startDate, endDate, page = '1', limit = '20' } = req.query as FilterParams;

        const where: Record<string, unknown> = {};
        if (status) where['status'] = status;
        if (startDate || endDate) {
            where['createdAt'] = {};
            if (startDate) (where['createdAt'] as Record<string, unknown>)['gte'] = new Date(startDate);
            if (endDate) (where['createdAt'] as Record<string, unknown>)['lte'] = new Date(endDate);
        }

        const [payments, total] = await Promise.all([
            prisma.payment.findMany({
                where,
                include: {
                    shipment: { select: { trackingCode: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma.payment.count({ where }),
        ]);

        res.json({
            data: payments,
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
                pagination: { page: parseInt(page), limit: parseInt(limit), total },
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch payments');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payments' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// DISPATCH ADMIN ENDPOINTS
// ==================================================

// GET /admin/dispatch/pending-shipments — unassigned shipments
router.get('/dispatch/pending-shipments', async (req: Request, res: Response) => {
    try {
        const { hubId, page = '1', limit = '50' } = req.query as FilterParams;
        const skip = (parseInt(page!) - 1) * parseInt(limit!);

        const where: Record<string, unknown> = {
            status: { in: ['REGISTERED', 'SCANNED'] },
        };
        if (hubId) where['originHubId'] = hubId;

        const [shipments, total] = await Promise.all([
            prisma.shipment.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit!),
                select: {
                    id: true, trackingNumber: true, status: true,
                    senderName: true, recipientName: true, recipientCity: true,
                    weightKg: true, originHubId: true, destinationHubId: true,
                    createdAt: true,
                },
            }),
            prisma.shipment.count({ where }),
        ]);

        res.json({
            data: shipments,
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
                pagination: { page: parseInt(page!), limit: parseInt(limit!), total },
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch pending shipments');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch pending shipments' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// GET /admin/dispatch/drivers — available drivers with current load
router.get('/dispatch/drivers', async (req: Request, res: Response) => {
    try {
        const { hubId } = req.query as FilterParams;

        const where: Record<string, unknown> = { status: 'ACTIVE' };
        if (hubId) where['hubId'] = hubId;

        const drivers = await prisma.driver.findMany({
            where,
            select: {
                id: true, firstName: true, lastName: true,
                phone: true, status: true, hubId: true,
                vehicleId: true,
                _count: {
                    select: {
                        dispatchTasks: { where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } },
                    },
                },
            },
            orderBy: { lastName: 'asc' },
        });

        res.json({
            data: drivers,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch drivers');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch drivers' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// GET /admin/dispatch/plans — route plans with filters
router.get('/dispatch/plans', async (req: Request, res: Response) => {
    try {
        const { hubId, status, page = '1', limit = '20' } = req.query as FilterParams;
        const skip = (parseInt(page!) - 1) * parseInt(limit!);

        const where: Record<string, unknown> = {};
        if (hubId) where['hubId'] = hubId;
        if (status) where['status'] = status;

        const [plans, total] = await Promise.all([
            prisma.routePlan.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit!),
                include: {
                    route: { select: { id: true, name: true } },
                    hub: { select: { id: true, name: true, code: true } },
                    driver: { select: { id: true, firstName: true, lastName: true } },
                    _count: { select: { tasks: true } },
                },
            }),
            prisma.routePlan.count({ where }),
        ]);

        res.json({
            data: plans,
            meta: {
                requestId: req.headers['x-request-id'] || 'unknown',
                timestamp: new Date().toISOString(),
                pagination: { page: parseInt(page!), limit: parseInt(limit!), total },
            }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch route plans');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch route plans' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// POST /admin/dispatch/plans — create route plan
router.post('/dispatch/plans', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
    try {
        const { routeId, hubId, driverId, vehicleId, scheduledDate, shipmentIds } = req.body;

        if (!routeId || !hubId || !driverId) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'routeId, hubId, and driverId are required' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }

        const plan = await prisma.routePlan.create({
            data: {
                routeId,
                hubId,
                driverId,
                vehicleId,
                scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
                status: 'DRAFT',
                totalTasks: shipmentIds?.length || 0,
            },
        });

        // Audit
        await prisma.auditLog.create({
            data: {
                entityType: 'ROUTE_PLAN',
                entityId: plan.id,
                action: 'CREATED',
                performedById: req.headers['x-user-id'] as string || 'admin',
                performedByRole: getAdminRole(req),
                changes: { routeId, hubId, driverId, vehicleId, shipmentCount: shipmentIds?.length || 0 },
            },
        });

        res.status(201).json({
            data: plan,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to create route plan');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to create route plan' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// PATCH /admin/dispatch/plans/:id/status — approve/start/complete a plan
router.patch('/dispatch/plans/:id/status', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
    try {
        const { status } = req.body as { status: string };
        const validTransitions: Record<string, string[]> = {
            DRAFT: ['APPROVED', 'CANCELLED'],
            APPROVED: ['IN_PROGRESS', 'CANCELLED'],
            IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
        };

        const plan = await prisma.routePlan.findUnique({ where: { id: req.params['id'] } });
        if (!plan) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'Route plan not found' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }

        const allowed = validTransitions[plan.status] || [];
        if (!allowed.includes(status)) {
            res.status(400).json({
                error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${plan.status} to ${status}` },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }

        const updated = await prisma.routePlan.update({
            where: { id: req.params['id'] },
            data: {
                status,
                ...(status === 'IN_PROGRESS' && { startedAt: new Date() }),
                ...(status === 'COMPLETED' && { completedAt: new Date() }),
            },
        });

        await prisma.auditLog.create({
            data: {
                entityType: 'ROUTE_PLAN',
                entityId: plan.id,
                action: `STATUS_${status}`,
                performedById: req.headers['x-user-id'] as string || 'admin',
                performedByRole: getAdminRole(req),
                changes: { previousStatus: plan.status, newStatus: status },
            },
        });

        res.json({
            data: updated,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to update plan status');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to update plan status' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

export default router;
