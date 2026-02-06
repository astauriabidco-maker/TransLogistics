/**
 * Shipment API Routes
 * 
 * Internal endpoints for shipment lifecycle management.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getShipmentService, ShipmentError } from './shipment.service';
import type { ShipmentStatus } from '@prisma/client';

const router = Router();

// ==================================================
// GET SHIPMENT WITH HISTORY
// ==================================================

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const shipmentService = getShipmentService(prisma);
        const shipment = await shipmentService.getShipmentWithEvents(req.params.id);

        res.json({
            data: shipment,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        if (error instanceof ShipmentError) {
            res.status(error.code === 'SHIPMENT_NOT_FOUND' ? 404 : 400).json({
                error: { code: error.code, message: error.message },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }
        logger.error({ error }, 'Failed to fetch shipment');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch shipment' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// GET EVENT HISTORY
// ==================================================

router.get('/:id/events', async (req: Request, res: Response) => {
    try {
        const shipmentService = getShipmentService(prisma);
        const events = await shipmentService.getHistory(req.params.id);

        res.json({
            data: events,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch shipment events');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch events' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// GET ALLOWED TRANSITIONS
// ==================================================

router.get('/:id/transitions', async (req: Request, res: Response) => {
    try {
        const shipment = await prisma.shipment.findUnique({
            where: { id: req.params.id },
            select: { status: true },
        });

        if (!shipment) {
            res.status(404).json({
                error: { code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }

        const shipmentService = getShipmentService(prisma);
        const allowed = shipmentService.getAllowedTransitions(shipment.status);

        res.json({
            data: { currentStatus: shipment.status, allowedTransitions: allowed },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to get transitions');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to get transitions' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// TRANSITION SHIPMENT STATE
// ==================================================

router.post('/:id/transition', async (req: Request, res: Response) => {
    try {
        const { toStatus, reason, metadata, hubId } = req.body;
        const userId = req.headers['x-user-id'] as string | undefined;

        if (!toStatus) {
            res.status(400).json({
                error: { code: 'VALIDATION_ERROR', message: 'toStatus is required' },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }

        const shipmentService = getShipmentService(prisma);
        const shipment = await shipmentService.transition(
            req.params.id,
            toStatus as ShipmentStatus,
            { reason, metadata, hubId, userId }
        );

        res.json({
            data: shipment,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        if (error instanceof ShipmentError) {
            const statusCode = error.code === 'SHIPMENT_NOT_FOUND' ? 404 : 400;
            res.status(statusCode).json({
                error: { code: error.code, message: error.message },
                meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
            });
            return;
        }
        logger.error({ error }, 'Failed to transition shipment');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to transition shipment' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

// ==================================================
// GET SHIPMENTS BY STATUS
// ==================================================

router.get('/status/:status', async (req: Request, res: Response) => {
    try {
        const { hubId, limit, offset } = req.query;
        const status = req.params.status as ShipmentStatus;

        const shipmentService = getShipmentService(prisma);
        const shipments = await shipmentService.getByStatus(status, {
            hubId: hubId as string,
            limit: limit ? parseInt(limit as string) : undefined,
            offset: offset ? parseInt(offset as string) : undefined,
        });

        res.json({
            data: shipments,
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch shipments by status');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch shipments' },
            meta: { requestId: req.headers['x-request-id'] || 'unknown', timestamp: new Date().toISOString() }
        });
    }
});

export default router;
