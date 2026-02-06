/**
 * Admin API Routes
 * 
 * Internal operations endpoints for managing logistics.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const router = Router();

// ==================================================
// TYPES
// ==================================================

type AdminRole = 'READ_ONLY' | 'OPERATOR' | 'ADMIN';

interface FilterParams {
    hubId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    limit?: string;
}

// ==================================================
// MIDDLEWARE
// ==================================================

// Simulated auth - in production, extract from JWT/session
function getAdminRole(req: Request): AdminRole {
    const role = req.headers['x-admin-role'] as string;
    if (role === 'ADMIN' || role === 'OPERATOR' || role === 'READ_ONLY') {
        return role;
    }
    return 'READ_ONLY';
}

function requireRole(...roles: AdminRole[]) {
    return (req: Request, res: Response, next: Function) => {
        const userRole = getAdminRole(req);
        if (!roles.includes(userRole)) {
            return res.status(403).json({
                error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
        }
        next();
    };
}

// ==================================================
// HUBS (for filter dropdown)
// ==================================================

router.get('/hubs', async (req: Request, res: Response) => {
    try {
        const hubs = await prisma.hub.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, code: true, name: true, city: true },
            orderBy: { name: 'asc' },
        });

        res.json({
            data: hubs,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch hubs');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch hubs' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
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

export default router;
