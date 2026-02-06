/**
 * SupplierOrder Routes
 * 
 * API endpoints for supplier-side operations.
 */

import { Router, type Request, type Response } from 'express';
import { getSupplierOrderService } from './supplier-order.service';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { SupplierOrderStatus, SupplierOrderExceptionType } from '@prisma/client';

const router = Router();

// ==================================================
// CRUD ENDPOINTS
// ==================================================

/**
 * POST /api/shop-ship/supplier-orders
 * Create a new supplier order.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const order = await service.create(req.body);
        res.status(201).json(order);
    } catch (error) {
        logger.error({ error }, 'Failed to create supplier order');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create' });
    }
});

/**
 * GET /api/shop-ship/supplier-orders/:id
 * Get order with details.
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const order = await service.getWithDetails(req.params['id'] as string);
        res.json(order);
    } catch (error) {
        res.status(404).json({ error: 'Order not found' });
    }
});

/**
 * GET /api/shop-ship/supplier-orders/status/:status
 * Get orders by status.
 */
router.get('/status/:status', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const hubId = req.query['hubId'] as string | undefined;
        const orders = await service.getByStatus(
            req.params['status'] as SupplierOrderStatus,
            hubId
        );
        res.json(orders);
    } catch (error) {
        logger.error({ error }, 'Failed to get orders by status');
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

// ==================================================
// LIFECYCLE ENDPOINTS
// ==================================================

/**
 * POST /api/shop-ship/supplier-orders/:id/place
 * Mark order as placed with supplier.
 */
router.post('/:id/place', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const { placedById, ...rest } = req.body;

        if (!placedById) {
            res.status(400).json({ error: 'placedById is required' });
            return;
        }

        const order = await service.placeOrder(req.params['id'] as string, {
            placedById,
            ...rest
        });
        res.json(order);
    } catch (error) {
        logger.error({ error }, 'Failed to place order');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to place' });
    }
});

/**
 * POST /api/shop-ship/supplier-orders/:id/ship
 * Mark order as shipped by supplier.
 */
router.post('/:id/ship', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const { trackingNumber, shippedById } = req.body;

        if (!trackingNumber || !shippedById) {
            res.status(400).json({ error: 'trackingNumber and shippedById are required' });
            return;
        }

        const order = await service.markShipped(req.params['id'] as string, {
            trackingNumber,
            shippedById,
        });
        res.json(order);
    } catch (error) {
        logger.error({ error }, 'Failed to mark shipped');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to ship' });
    }
});

/**
 * POST /api/shop-ship/supplier-orders/:id/receive
 * Hub reception - mark as received with metadata.
 */
router.post('/:id/receive', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const { receivedById, receivedQuantity, receptionCondition, receptionPhotos, receptionNotes } = req.body;

        if (!receivedById || receivedQuantity === undefined || !receptionCondition) {
            res.status(400).json({
                error: 'receivedById, receivedQuantity, and receptionCondition are required'
            });
            return;
        }

        const order = await service.receiveAtHub(req.params['id'] as string, {
            receivedById,
            receivedQuantity,
            receptionCondition,
            receptionPhotos,
            receptionNotes,
        });
        res.json(order);
    } catch (error) {
        logger.error({ error }, 'Failed to receive order');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to receive' });
    }
});

// ==================================================
// EXCEPTION ENDPOINTS
// ==================================================

/**
 * POST /api/shop-ship/supplier-orders/:id/exception
 * Report an exception (manual).
 */
router.post('/:id/exception', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const { exceptionType, exceptionNotes, reportedById } = req.body;

        if (!exceptionType || !exceptionNotes || !reportedById) {
            res.status(400).json({
                error: 'exceptionType, exceptionNotes, and reportedById are required'
            });
            return;
        }

        const order = await service.reportException(req.params['id'] as string, {
            exceptionType: exceptionType as SupplierOrderExceptionType,
            exceptionNotes,
            reportedById,
        });
        res.json(order);
    } catch (error) {
        logger.error({ error }, 'Failed to report exception');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to report' });
    }
});

/**
 * POST /api/shop-ship/supplier-orders/:id/resolve
 * Resolve an exception (admin action).
 */
router.post('/:id/resolve', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const { resolution, resolvedById, transitionTo } = req.body;

        if (!resolution || !resolvedById || !transitionTo) {
            res.status(400).json({
                error: 'resolution, resolvedById, and transitionTo are required'
            });
            return;
        }

        const order = await service.resolveException(req.params['id'] as string, {
            resolution,
            resolvedById,
            transitionTo,
        });
        res.json(order);
    } catch (error) {
        logger.error({ error }, 'Failed to resolve exception');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to resolve' });
    }
});

/**
 * GET /api/shop-ship/supplier-orders/exceptions/pending
 * Get pending exceptions.
 */
router.get('/exceptions/pending', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const hubId = req.query['hubId'] as string | undefined;
        const exceptions = await service.getPendingExceptions(hubId);
        res.json(exceptions);
    } catch (error) {
        logger.error({ error }, 'Failed to get pending exceptions');
        res.status(500).json({ error: 'Failed to get exceptions' });
    }
});

// ==================================================
// HUB OPERATIONS
// ==================================================

/**
 * GET /api/shop-ship/supplier-orders/hub/:hubId/awaiting
 * Get orders awaiting reception at hub.
 */
router.get('/hub/:hubId/awaiting', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const orders = await service.getAwaitingReception(req.params['hubId'] as string);
        res.json(orders);
    } catch (error) {
        logger.error({ error }, 'Failed to get awaiting orders');
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

/**
 * POST /api/shop-ship/supplier-orders/:id/cancel
 * Cancel an order.
 */
router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getSupplierOrderService(prisma);
        const { reason } = req.body;

        if (!reason) {
            res.status(400).json({ error: 'reason is required' });
            return;
        }

        const order = await service.cancel(req.params['id'] as string, reason);
        res.json(order);
    } catch (error) {
        logger.error({ error }, 'Failed to cancel order');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to cancel' });
    }
});

export default router;
