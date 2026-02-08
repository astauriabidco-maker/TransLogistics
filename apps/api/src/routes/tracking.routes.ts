/**
 * Public Tracking API Routes
 *
 * Customer-facing shipment tracking — no authentication required.
 * Returns only sanitized data (no PII, no internal IDs).
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const router = Router();

// ==================================================
// GET /:trackingCode — Public shipment status
// ==================================================

router.get('/:trackingCode', async (req: Request, res: Response) => {
    try {
        const { trackingCode } = req.params;

        if (!trackingCode || trackingCode.length < 5) {
            res.status(400).json({
                error: { code: 'INVALID_TRACKING', message: 'Numéro de suivi invalide' },
            });
            return;
        }

        // Find shipment by tracking code
        const shipment = await (prisma.shipment as any).findFirst({
            where: { trackingCode },
            include: {
                route: {
                    select: {
                        originHub: { select: { city: true, country: true } },
                        destinationHub: { select: { city: true, country: true } },
                    },
                },
            },
        });

        if (!shipment) {
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'Aucun envoi trouvé avec ce numéro de suivi' },
            });
            return;
        }

        // Build sanitized timeline from audit log
        const auditLogs = await (prisma.auditLog as any).findMany({
            where: {
                entityType: 'SHIPMENT',
                entityId: shipment.id,
                action: {
                    in: [
                        'CREATED', 'REGISTERED', 'SCANNED', 'VALIDATED',
                        'IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY', 'DELIVERED',
                        'DISPATCHED', 'PICKED_UP',
                    ],
                },
            },
            orderBy: { timestamp: 'asc' },
            select: {
                action: true,
                timestamp: true,
            },
        });

        // Map actions to customer-friendly labels
        const ACTION_LABELS: Record<string, string> = {
            'CREATED': 'Envoi enregistré',
            'REGISTERED': 'Envoi enregistré',
            'SCANNED': 'Colis scanné',
            'VALIDATED': 'Colis validé',
            'IN_TRANSIT': 'En transit',
            'ARRIVED': 'Arrivé au hub',
            'DISPATCHED': 'Expédié pour livraison',
            'OUT_FOR_DELIVERY': 'En cours de livraison',
            'PICKED_UP': 'Récupéré',
            'DELIVERED': 'Livré',
        };

        const STATUS_LABELS: Record<string, string> = {
            'DRAFT': 'En préparation',
            'REGISTERED': 'Enregistré',
            'PENDING_PICKUP': 'En attente de collecte',
            'PICKED_UP': 'Collecté',
            'IN_TRANSIT': 'En transit',
            'AT_HUB': 'Au hub',
            'OUT_FOR_DELIVERY': 'En cours de livraison',
            'DELIVERED': 'Livré',
            'CANCELLED': 'Annulé',
            'RETURNED': 'Retourné',
        };

        const timeline = (auditLogs as any[]).map((log: any) => ({
            label: ACTION_LABELS[log.action] || log.action,
            timestamp: log.timestamp?.toISOString?.() || log.timestamp,
        }));

        res.json({
            data: {
                trackingCode: shipment.trackingCode,
                status: STATUS_LABELS[shipment.status] || shipment.status,
                statusCode: shipment.status,
                origin: shipment.route
                    ? `${shipment.route.originHub.city}, ${shipment.route.originHub.country}`
                    : null,
                destination: shipment.route
                    ? `${shipment.route.destinationHub.city}, ${shipment.route.destinationHub.country}`
                    : null,
                createdAt: shipment.createdAt?.toISOString?.() || shipment.createdAt,
                estimatedDelivery: shipment.estimatedDeliveryDate
                    ? shipment.estimatedDeliveryDate.toISOString()
                    : null,
                lastUpdate: shipment.updatedAt?.toISOString?.() || shipment.updatedAt,
                timeline,
            },
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch tracking info');
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la recherche du suivi' },
        });
    }
});

export default router;
