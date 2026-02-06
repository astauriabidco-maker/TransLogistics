/**
 * PurchaseRequest Routes
 * 
 * API endpoints for Shop & Ship purchase requests.
 */

import { Router, type Request, type Response } from 'express';
import { getPurchaseRequestService, CreatePurchaseRequestInput, QuotePurchaseRequestInput } from './purchase-request.service';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { PurchaseRequestStatus } from '@prisma/client';

const router = Router();

// ==================================================
// CUSTOMER ENDPOINTS
// ==================================================

/**
 * POST /api/shop-ship/requests
 * Create a new purchase request.
 */
router.post('/requests', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const input: CreatePurchaseRequestInput = req.body;

        if (!input.userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }

        const request = await service.create(input);
        res.status(201).json(request);
    } catch (error) {
        logger.error({ error }, 'Failed to create purchase request');
        res.status(500).json({ error: 'Failed to create request' });
    }
});

/**
 * GET /api/shop-ship/requests/my
 * Get current user's requests.
 */
router.get('/requests/my', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const userId = req.query['userId'] as string;

        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }

        const requests = await service.getByUser(userId);
        res.json(requests);
    } catch (error) {
        logger.error({ error }, 'Failed to get user requests');
        res.status(500).json({ error: 'Failed to get requests' });
    }
});

// ==================================================
// ADMIN ENDPOINTS
// ==================================================

/**
 * GET /api/shop-ship/requests/status/:status
 * Get requests by status (admin).
 */
router.get('/requests/status/:status', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const status = req.params['status'] as PurchaseRequestStatus;
        const limit = parseInt(req.query['limit'] as string) || 50;
        const offset = parseInt(req.query['offset'] as string) || 0;

        const requests = await service.getByStatus(status, { limit, offset });
        res.json(requests);
    } catch (error) {
        logger.error({ error }, 'Failed to get requests by status');
        res.status(500).json({ error: 'Failed to get requests' });
    }
});

/**
 * GET /api/shop-ship/requests/:id
 * Get request with full details.
 */
router.get('/requests/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const request = await service.getWithDetails(req.params['id'] as string);
        res.json(request);
    } catch (error) {
        logger.error({ error }, 'Failed to get request');
        res.status(404).json({ error: 'Request not found' });
    }
});

/**
 * POST /api/shop-ship/requests/:id/quote
 * Quote a purchase request (admin).
 */
router.post('/requests/:id/quote', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const input: QuotePurchaseRequestInput = req.body;

        if (!input.quotedById) {
            res.status(400).json({ error: 'quotedById is required' });
            return;
        }

        const request = await service.quote(req.params['id'] as string, input);
        res.json(request);
    } catch (error) {
        logger.error({ error }, 'Failed to quote request');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to quote' });
    }
});

/**
 * POST /api/shop-ship/requests/:id/approve
 * Approve a quoted request - FREEZES pricing.
 */
router.post('/requests/:id/approve', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const { userId } = req.body;

        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }

        const request = await service.approve(req.params['id'] as string, userId);
        res.json(request);
    } catch (error) {
        logger.error({ error }, 'Failed to approve request');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to approve' });
    }
});

/**
 * POST /api/shop-ship/requests/:id/transition
 * Transition request status.
 */
router.post('/requests/:id/transition', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const { toStatus, reason } = req.body;

        if (!toStatus) {
            res.status(400).json({ error: 'toStatus is required' });
            return;
        }

        const request = await service.transition(req.params['id'] as string, toStatus, reason);
        res.json(request);
    } catch (error) {
        logger.error({ error }, 'Failed to transition request');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to transition' });
    }
});

/**
 * POST /api/shop-ship/requests/:id/adjust
 * Admin adjustment with audit (only before approval).
 */
router.post('/requests/:id/adjust', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const { fieldName, newValue, reason, adjustedById } = req.body;

        if (!fieldName || !newValue || !reason || !adjustedById) {
            res.status(400).json({
                error: 'fieldName, newValue, reason, and adjustedById are required'
            });
            return;
        }

        const result = await service.adjust(req.params['id'] as string, {
            fieldName,
            newValue,
            reason,
            adjustedById,
        });

        res.json(result);
    } catch (error) {
        logger.error({ error }, 'Failed to adjust request');
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to adjust' });
    }
});

/**
 * GET /api/shop-ship/requests/:id/adjustments
 * Get adjustment history (audit trail).
 */
router.get('/requests/:id/adjustments', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const adjustments = await service.getAdjustmentHistory(req.params['id'] as string);
        res.json(adjustments);
    } catch (error) {
        logger.error({ error }, 'Failed to get adjustments');
        res.status(500).json({ error: 'Failed to get adjustments' });
    }
});

/**
 * GET /api/shop-ship/requests/:id/transitions
 * Get allowed next states.
 */
router.get('/requests/:id/transitions', async (req: Request, res: Response): Promise<void> => {
    try {
        const service = getPurchaseRequestService(prisma);
        const request = await service.getWithDetails(req.params['id'] as string);
        const allowed = service.getAllowedTransitions(request.status);
        res.json({ currentStatus: request.status, allowedTransitions: allowed });
    } catch (error) {
        logger.error({ error }, 'Failed to get transitions');
        res.status(404).json({ error: 'Request not found' });
    }
});

export default router;

