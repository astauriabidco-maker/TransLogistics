/**
 * Driver API Routes
 * 
 * REST endpoints for the driver mobile app:
 * - Authentication (login, session)
 * - Route plans (get active)
 * - Task transitions (start pickup, confirm, etc.)
 * - Delivery proofs (submit)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { getDispatchTaskService } from './dispatch-task.service';
import { getDeliveryProofService } from './delivery-proof.service';
import { generateNavigationLinksSync } from './navigation.utils';
import crypto from 'crypto';

const router = Router();

// Simple JWT-like token (for demo - in production use proper JWT)
const SECRET: string = process.env['JWT_SECRET'] || 'driver-secret-key';

// ==================================================
// AUTH MIDDLEWARE
// ==================================================

interface AuthenticatedRequest extends Request {
    driverId?: string;
    userId?: string;
}

function authenticateDriver(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ code: 'UNAUTHORIZED', message: 'Token manquant' });
        return;
    }

    const token = authHeader.substring(7);
    try {
        // Simple token format: base64(driverId:userId:timestamp:signature)
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const parts = decoded.split(':');
        if (parts.length < 4) {
            res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token invalide' });
            return;
        }

        const [driverId, userId, timestamp, signature] = parts;

        // Check expiry (30 days)
        const tokenTime = parseInt(timestamp!, 10);
        const now = Date.now();
        if (now - tokenTime > 30 * 24 * 60 * 60 * 1000) {
            res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Token expiré' });
            return;
        }

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', SECRET)
            .update(`${driverId}:${userId}:${timestamp}`)
            .digest('hex')
            .substring(0, 16);

        if (signature !== expectedSignature) {
            res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token invalide' });
            return;
        }

        req.driverId = driverId;
        req.userId = userId;
        next();
    } catch {
        res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token invalide' });
    }
}

function generateToken(driverId: string, userId: string): { token: string; expiresAt: string } {
    const timestamp = Date.now().toString();
    const signature = crypto
        .createHmac('sha256', SECRET)
        .update(`${driverId}:${userId}:${timestamp}`)
        .digest('hex')
        .substring(0, 16);

    const token = Buffer.from(`${driverId}:${userId}:${timestamp}:${signature}`).toString('base64');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return { token, expiresAt };
}

// ==================================================
// AUTH ROUTES
// ==================================================

/**
 * POST /auth/login
 * Driver login with phone and password hash
 */
router.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phone, pin } = req.body;

        if (!phone || !pin) {
            res.status(400).json({ code: 'MISSING_FIELDS', message: 'Téléphone et PIN requis' });
            return;
        }

        // Find user by phone with driver relation
        const user = await prisma.user.findFirst({
            where: { phone: phone.replace(/\s/g, '') },
            include: {
                driver: {
                    include: {
                        hub: true,
                    },
                },
            },
        });

        if (!user || !user.driver) {
            res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Identifiants incorrects' });
            return;
        }

        // Verify password (in production, compare hash properly)
        // For simplicity, we use last 4 digits of password hash as PIN
        const pinFromHash = user.passwordHash.substring(user.passwordHash.length - 4);
        if (pin !== pinFromHash && pin !== '1234') { // Allow test PIN
            res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Identifiants incorrects' });
            return;
        }

        // Check driver status
        if (user.driver.status !== 'ACTIVE') {
            res.status(403).json({ code: 'DRIVER_INACTIVE', message: 'Compte chauffeur inactif' });
            return;
        }

        // Generate token
        const { token, expiresAt } = generateToken(user.driver.id, user.id);

        res.json({
            driver: {
                id: user.driver.id,
                userId: user.id,
                name: `${user.firstName} ${user.lastName}`,
                phone: user.phone,
            },
            token,
            expiresAt,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /auth/me
 * Get current driver profile
 */
router.get('/auth/me', authenticateDriver, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const driver = await prisma.driver.findUnique({
            where: { id: req.driverId },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
                hub: true,
            },
        });

        if (!driver) {
            res.status(404).json({ code: 'NOT_FOUND', message: 'Chauffeur introuvable' });
            return;
        }

        res.json({
            id: driver.id,
            userId: driver.user.id,
            name: `${driver.user.firstName} ${driver.user.lastName}`,
            phone: driver.user.phone,
            email: driver.user.email,
            status: driver.status,
            vehicleType: driver.vehicleType,
            vehiclePlate: driver.vehiclePlate,
            hubName: driver.hub.name,
        });
    } catch (error) {
        next(error);
    }
});

// ==================================================
// ROUTE PLAN ROUTES
// ==================================================

/**
 * GET /route-plan/active
 * Get the driver's active route plan for today
 */
router.get('/route-plan/active', authenticateDriver, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find active dispatch tasks for this driver (grouped by route plan or standalone)
        const tasks = await prisma.dispatchTask.findMany({
            where: {
                driverId: req.driverId,
                status: { in: ['ASSIGNED', 'EN_ROUTE_PICKUP', 'PICKED_UP', 'EN_ROUTE_DELIVERY'] },
                assignedAt: { gte: today, lt: tomorrow },
            },
            include: {
                route: {
                    include: {
                        originHub: true,
                        destinationHub: true,
                    },
                },
                deliveries: {
                    include: {
                        shipment: true,
                        deliveryProof: true,
                    },
                },
                driver: {
                    include: {
                        hub: true,
                    },
                },
            },
            orderBy: { assignedAt: 'asc' },
        });

        if (tasks.length === 0) {
            res.status(404).json({ code: 'NOT_FOUND', message: 'Aucune tournée active' });
            return;
        }

        // Get driver's hub info
        const firstTask = tasks[0]!;
        const driver = firstTask.driver;
        if (!driver?.hub) {
            res.status(500).json({ code: 'NO_HUB', message: 'Hub non trouvé pour ce chauffeur' });
            return;
        }
        const driverHub = driver.hub;

        res.json({
            id: `plan-${today.toISOString().split('T')[0]}`,
            planDate: today.toISOString(),
            status: 'IN_PROGRESS',
            vehicle: {
                id: firstTask.driverId,
                type: driver.vehicleType || 'MOTO',
            },
            hub: {
                name: driverHub.name,
                address: driverHub.addressLine1,
            },
            tasks: tasks.map((task) => {
                const destHub = task.route.destinationHub;
                const lat = destHub.latitude ? Number(destHub.latitude) : undefined;
                const lng = destHub.longitude ? Number(destHub.longitude) : undefined;
                const address = destHub.addressLine1;

                return {
                    id: task.id,
                    status: task.status,
                    deliveryAddress: address,
                    deliveryLat: lat,
                    deliveryLng: lng,
                    navigation: generateNavigationLinksSync({ lat, lng, address }),
                    recipientName: task.recipientName || 'Destinataire',
                    recipientPhone: '',
                    notes: task.failureReason || undefined,
                    deliveries: task.deliveries.map((d) => ({
                        id: d.id,
                        shipmentId: d.shipmentId,
                        status: d.status,
                    })),
                };
            }),
        });
    } catch (error) {
        next(error);
    }
});

// ==================================================
// TASK ACTION ROUTES
// ==================================================

/**
 * POST /tasks/:id/start-pickup
 * Driver starts pickup route to hub
 */
router.post('/tasks/:id/start-pickup', authenticateDriver, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const taskId = req.params['id'] as string;
        const { lat, lng } = req.body;

        const service = getDispatchTaskService(prisma);
        await service.startPickup(taskId, {
            driverId: req.driverId!,
            locationLat: lat,
            locationLng: lng,
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /tasks/:id/confirm-pickup
 * Driver confirms pickup at hub
 */
router.post('/tasks/:id/confirm-pickup', authenticateDriver, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const taskId = req.params['id'] as string;
        const { pickedUpShipmentIds, photoUrls, notes } = req.body;

        const service = getDispatchTaskService(prisma);
        await service.confirmPickup(taskId, {
            driverId: req.driverId!,
            pickedUpShipmentIds: pickedUpShipmentIds || [],
            photoUrls,
            notes,
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /tasks/:id/start-delivery
 * Driver starts delivery route
 */
router.post('/tasks/:id/start-delivery', authenticateDriver, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const taskId = req.params['id'] as string;

        const service = getDispatchTaskService(prisma);
        await service.startDelivery(taskId, {
            driverId: req.driverId!,
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// ==================================================
// DELIVERY PROOF ROUTES
// ==================================================

/**
 * POST /deliveries/:id/proof
 * Submit delivery proof (photo/signature)
 */
router.post('/deliveries/:id/proof', authenticateDriver, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const deliveryId = req.params['id'] as string;
        const { proofType, photoUrls, signatureUrl, otpCode, recipientName, lat, lng, notes } = req.body;

        const service = getDeliveryProofService(prisma);
        await service.createProof({
            shipmentDeliveryId: deliveryId,
            proofType,
            photoUrls,
            signatureUrl,
            otpCode,
            recipientName,
            capturedLat: lat,
            capturedLng: lng,
            notes,
            driverId: req.driverId!,
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /deliveries/:id/failed
 * Record failed delivery attempt
 */
router.post('/deliveries/:id/failed', authenticateDriver, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const deliveryId = req.params['id'] as string;
        const { reason, photoUrls, lat, lng } = req.body;

        if (!reason) {
            res.status(400).json({ code: 'MISSING_REASON', message: 'Raison requise' });
            return;
        }

        const service = getDeliveryProofService(prisma);
        await service.recordFailedAttempt(deliveryId, {
            reason,
            driverId: req.driverId!,
            photoUrls,
            lat,
            lng,
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// ==================================================
// BATCH SYNC ROUTE
// ==================================================

interface SyncActionPayload {
    taskId?: string;
    shipmentDeliveryId?: string;
    lat?: number;
    lng?: number;
    pickedUpShipmentIds?: string[];
    photoUrls?: string[];
    reason?: string;
}

interface SyncAction {
    id: string;
    type: 'START_PICKUP' | 'CONFIRM_PICKUP' | 'START_DELIVERY' | 'FAILED_ATTEMPT';
    payload: SyncActionPayload;
}

/**
 * POST /sync
 * Batch sync offline actions
 */
router.post('/sync', authenticateDriver, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { actions } = req.body as { actions?: SyncAction[] };
        const results: { id: string; success: boolean; error?: string }[] = [];

        const dispatchService = getDispatchTaskService(prisma);
        const proofService = getDeliveryProofService(prisma);

        for (const action of actions || []) {
            try {
                switch (action.type) {
                    case 'START_PICKUP':
                        await dispatchService.startPickup(action.payload.taskId!, {
                            driverId: req.driverId!,
                            locationLat: action.payload.lat,
                            locationLng: action.payload.lng,
                        });
                        break;

                    case 'CONFIRM_PICKUP':
                        await dispatchService.confirmPickup(action.payload.taskId!, {
                            driverId: req.driverId!,
                            pickedUpShipmentIds: action.payload.pickedUpShipmentIds || [],
                            photoUrls: action.payload.photoUrls,
                        });
                        break;

                    case 'START_DELIVERY':
                        await dispatchService.startDelivery(action.payload.taskId!, {
                            driverId: req.driverId!,
                        });
                        break;

                    case 'FAILED_ATTEMPT':
                        await proofService.recordFailedAttempt(action.payload.shipmentDeliveryId!, {
                            reason: action.payload.reason!,
                            driverId: req.driverId!,
                            photoUrls: action.payload.photoUrls,
                            lat: action.payload.lat,
                            lng: action.payload.lng,
                        });
                        break;

                    default:
                        throw new Error(`Unknown action type: ${action.type}`);
                }
                results.push({ id: action.id, success: true });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                results.push({ id: action.id, success: false, error: message });
            }
        }

        res.json({ results });
    } catch (error) {
        next(error);
    }
});

export default router;
