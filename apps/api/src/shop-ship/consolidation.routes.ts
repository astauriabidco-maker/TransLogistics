/**
 * Consolidation Routes
 * 
 * API endpoints for consolidation batch management.
 */

import { Router, type Request, type Response } from 'express';
import { getConsolidationService } from './consolidation.service';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { ConsolidationBatchStatus } from '@prisma/client';

const router = Router();

// ==================================================
// DISCOVERY & CRUD
// ==================================================

/**
 * GET /api/shop-ship/consolidation/eligible
 * Find orders eligible for consolidation.
 */
router.get('/eligible', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const { sourceHubId, destinationHubId, userId } = req.query;

        if (!sourceHubId || !destinationHubId || !userId) {
            res.status(400).json({ error: 'sourceHubId, destinationHubId, and userId are required' });
            return;
        }

        const orders = await service.findEligibleForConsolidation(
            sourceHubId as string,
            destinationHubId as string,
            userId as string
        );
        res.json(orders);
    } catch (error) {
        logger.error({ error }, 'Failed to find eligible orders');
        res.status(500).json({ error: 'Failed to find eligible orders' });
    }
});

/**
 * POST /api/shop-ship/consolidation/batches
 * Create a new consolidation batch.
 */
router.post('/batches', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const batch = await service.createBatch(req.body);
        res.status(201).json(batch);
    } catch (error) {
        logger.error({ error }, 'Failed to create batch');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create' });
    }
});

/**
 * GET /api/shop-ship/consolidation/batches/:id
 * Get batch with full details.
 */
router.get('/batches/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const batch = await service.getWithDetails(req.params['id'] as string);
        res.json(batch);
    } catch (error) {
        res.status(404).json({ error: 'Batch not found' });
    }
});

/**
 * GET /api/shop-ship/consolidation/batches/status/:status
 * Get batches by status.
 */
router.get('/batches/status/:status', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const hubId = req.query['hubId'] as string | undefined;
        const batches = await service.getByStatus(
            req.params['status'] as ConsolidationBatchStatus,
            hubId
        );
        res.json(batches);
    } catch (error) {
        logger.error({ error }, 'Failed to get batches by status');
        res.status(500).json({ error: 'Failed to get batches' });
    }
});

// ==================================================
// BATCH COMPOSITION
// ==================================================

/**
 * POST /api/shop-ship/consolidation/batches/:id/orders
 * Add an order to the batch.
 */
router.post('/batches/:id/orders', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const { supplierOrderId, addedById } = req.body;

        if (!supplierOrderId || !addedById) {
            res.status(400).json({ error: 'supplierOrderId and addedById are required' });
            return;
        }

        const order = await service.addOrderToBatch(req.params['id'] as string, {
            supplierOrderId,
            addedById,
        });
        res.json(order);
    } catch (error) {
        logger.error({ error }, 'Failed to add order to batch');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to add' });
    }
});

/**
 * DELETE /api/shop-ship/consolidation/batches/:id/orders/:orderId
 * Remove an order from the batch.
 */
router.delete('/batches/:id/orders/:orderId', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const order = await service.removeOrderFromBatch(
            req.params['id'] as string,
            req.params['orderId'] as string
        );
        res.json(order);
    } catch (error) {
        logger.error({ error }, 'Failed to remove order from batch');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to remove' });
    }
});

// ==================================================
// BATCH LIFECYCLE
// ==================================================

/**
 * POST /api/shop-ship/consolidation/batches/:id/close
 * Close the batch (no more additions).
 */
router.post('/batches/:id/close', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const batch = await service.closeBatch(req.params['id'] as string);
        res.json(batch);
    } catch (error) {
        logger.error({ error }, 'Failed to close batch');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to close' });
    }
});

/**
 * POST /api/shop-ship/consolidation/batches/:id/repackage
 * Apply repackaging options.
 */
router.post('/batches/:id/repackage', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const batch = await service.applyRepackaging(req.params['id'] as string, req.body);
        res.json(batch);
    } catch (error) {
        logger.error({ error }, 'Failed to apply repackaging');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to repackage' });
    }
});

/**
 * POST /api/shop-ship/consolidation/batches/:id/pack
 * Pack the batch with weight/volume.
 */
router.post('/batches/:id/pack', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const { packedById, totalWeightKg, totalVolumeM3 } = req.body;

        if (!packedById || totalWeightKg === undefined) {
            res.status(400).json({ error: 'packedById and totalWeightKg are required' });
            return;
        }

        const batch = await service.packBatch(req.params['id'] as string, {
            packedById,
            totalWeightKg,
            totalVolumeM3,
        });
        res.json(batch);
    } catch (error) {
        logger.error({ error }, 'Failed to pack batch');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to pack' });
    }
});

/**
 * POST /api/shop-ship/consolidation/batches/:id/approve
 * Approve the batch (required before shipment).
 */
router.post('/batches/:id/approve', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const { approvedById } = req.body;

        if (!approvedById) {
            res.status(400).json({ error: 'approvedById is required' });
            return;
        }

        const batch = await service.approveBatch(req.params['id'] as string, { approvedById });
        res.json(batch);
    } catch (error) {
        logger.error({ error }, 'Failed to approve batch');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to approve' });
    }
});

/**
 * POST /api/shop-ship/consolidation/batches/:id/create-shipment
 * Create shipment from approved batch.
 */
router.post('/batches/:id/create-shipment', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const { createdById } = req.body;

        if (!createdById) {
            res.status(400).json({ error: 'createdById is required' });
            return;
        }

        const batch = await service.createShipment(req.params['id'] as string, { createdById });
        res.json(batch);
    } catch (error) {
        logger.error({ error }, 'Failed to create shipment');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create shipment' });
    }
});

// ==================================================
// ADMIN QUERIES
// ==================================================

/**
 * GET /api/shop-ship/consolidation/pending-approval
 * Get batches pending approval.
 */
router.get('/pending-approval', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getConsolidationService(prisma);
        const hubId = req.query['hubId'] as string | undefined;
        const batches = await service.getPendingApproval(hubId);
        res.json(batches);
    } catch (error) {
        logger.error({ error }, 'Failed to get pending approval batches');
        res.status(500).json({ error: 'Failed to get batches' });
    }
});

export default router;
