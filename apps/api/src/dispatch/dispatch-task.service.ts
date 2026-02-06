/**
 * Dispatch Task Service
 * 
 * Core dispatch logic:
 * - Create tasks from eligible shipments
 * - Manual driver assignment
 * - State machine with audit logging
 * - Shipment binding (one active dispatch per shipment)
 */

import type {
    PrismaClient,
    DispatchTask,
    DispatchTaskStatus,
    ShipmentDelivery,
    ShipmentDeliveryStatus,
} from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// STATE MACHINE
// ==================================================

const ALLOWED_TRANSITIONS: Record<DispatchTaskStatus, DispatchTaskStatus[]> = {
    CREATED: ['ASSIGNED', 'FAILED'],
    ASSIGNED: ['EN_ROUTE_PICKUP', 'FAILED'],
    EN_ROUTE_PICKUP: ['PICKED_UP', 'FAILED'],
    PICKED_UP: ['EN_ROUTE_DELIVERY', 'FAILED'],
    EN_ROUTE_DELIVERY: ['DELIVERED', 'FAILED'],
    DELIVERED: [], // Terminal
    FAILED: [], // Terminal
};

// ==================================================
// TYPES
// ==================================================

export interface CreateDispatchTaskInput {
    hubId: string;
    routeId: string;
    shipmentIds: string[];
    deliveryAddress: string;
    deliveryLat?: number;
    deliveryLng?: number;
    recipientName: string;
    recipientPhone: string;
    createdById: string;
    notes?: string;
}

export interface AssignDriverInput {
    driverId: string;
    assignedById: string;
}

export interface StartPickupInput {
    driverId: string;
    locationLat?: number;
    locationLng?: number;
}

export interface ConfirmPickupInput {
    driverId: string;
    pickedUpShipmentIds: string[];
    photoUrls?: string[];
    notes?: string;
}

export interface StartDeliveryInput {
    driverId: string;
}

export interface FailTaskInput {
    reason: string;
    failedById: string;
}

// ==================================================
// SERVICE
// ==================================================

export class DispatchTaskService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Check if transition is allowed.
     */
    canTransition(from: DispatchTaskStatus, to: DispatchTaskStatus): boolean {
        return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
    }

    /**
     * Get allowed next states.
     */
    getAllowedTransitions(from: DispatchTaskStatus): DispatchTaskStatus[] {
        return ALLOWED_TRANSITIONS[from] ?? [];
    }

    /**
     * Find eligible shipments for dispatch at a hub.
     * Shipments must be ARRIVED at hub and not in active dispatch.
     */
    async findEligibleShipments(hubId: string, routeId?: string) {
        return this.prisma.shipment.findMany({
            where: {
                status: 'ARRIVED',
                routeId: routeId ?? undefined,
                // Not in active dispatch
                shipmentDeliveries: {
                    none: {
                        status: {
                            notIn: ['DELIVERED', 'RETURNED_TO_HUB', 'EXCEPTION'],
                        },
                    },
                },
            },
            include: {
                customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
                route: { select: { id: true, code: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Create a new dispatch task with shipments.
     * Enforces: one active dispatch per shipment.
     */
    async create(input: CreateDispatchTaskInput): Promise<DispatchTask> {
        // Validate shipments are eligible
        const shipments = await this.prisma.shipment.findMany({
            where: {
                id: { in: input.shipmentIds },
                status: 'ARRIVED',
            },
            include: {
                shipmentDeliveries: {
                    where: {
                        status: {
                            notIn: ['DELIVERED', 'RETURNED_TO_HUB', 'EXCEPTION'],
                        },
                    },
                },
            },
        });

        // Check all shipments found
        if (shipments.length !== input.shipmentIds.length) {
            const found = new Set(shipments.map(s => s.id));
            const missing = input.shipmentIds.filter(id => !found.has(id));
            throw new DispatchError('INVALID_SHIPMENTS', `Shipments not found or not eligible: ${missing.join(', ')}`);
        }

        // Check no shipment is in active dispatch
        const inActiveDispatch = shipments.filter(s => s.shipmentDeliveries.length > 0);
        if (inActiveDispatch.length > 0) {
            throw new DispatchError(
                'SHIPMENT_LOCKED',
                `Shipments already in active dispatch: ${inActiveDispatch.map(s => s.id).join(', ')}`
            );
        }

        // Create task with ShipmentDeliveries in transaction
        const task = await this.prisma.$transaction(async (tx) => {
            // Create DispatchTask
            const dispatchTask = await tx.dispatchTask.create({
                data: {
                    status: 'CREATED',
                    routeId: input.routeId,
                    // Placeholder driver - will be assigned later
                    driverId: 'UNASSIGNED',
                },
            });

            // Create ShipmentDelivery for each shipment
            await tx.shipmentDelivery.createMany({
                data: input.shipmentIds.map((shipmentId) => ({
                    shipmentId,
                    dispatchTaskId: dispatchTask.id,
                    status: 'PENDING_PICKUP' as ShipmentDeliveryStatus,
                    recipientName: input.recipientName,
                })),
            });

            // Update shipments to OUT_FOR_DELIVERY
            await tx.shipment.updateMany({
                where: { id: { in: input.shipmentIds } },
                data: { status: 'OUT_FOR_DELIVERY' },
            });

            // Log creation
            await tx.auditLog.create({
                data: {
                    entityType: 'DispatchTask',
                    entityId: dispatchTask.id,
                    action: 'CREATED',
                    performedById: input.createdById,
                    changes: {
                        shipmentIds: input.shipmentIds,
                        hubId: input.hubId,
                        recipientName: input.recipientName,
                    },
                },
            });

            return dispatchTask;
        });

        logger.info({ taskId: task.id, shipmentCount: input.shipmentIds.length }, 'DispatchTask created');
        return task;
    }

    /**
     * Assign a driver to the task (manual assignment).
     */
    async assignDriver(taskId: string, input: AssignDriverInput): Promise<DispatchTask> {
        const task = await this.prisma.dispatchTask.findUniqueOrThrow({
            where: { id: taskId },
        });

        if (!this.canTransition(task.status, 'ASSIGNED')) {
            throw new DispatchError('INVALID_TRANSITION', `Cannot assign driver from ${task.status} status`);
        }

        // Validate driver
        const driver = await this.prisma.driver.findUniqueOrThrow({
            where: { id: input.driverId },
        });

        if (driver.status !== 'ACTIVE') {
            throw new DispatchError('DRIVER_NOT_AVAILABLE', `Driver is ${driver.status}, not ACTIVE`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedTask = await tx.dispatchTask.update({
                where: { id: taskId },
                data: {
                    status: 'ASSIGNED',
                    driverId: input.driverId,
                    assignedAt: new Date(),
                },
            });

            await tx.auditLog.create({
                data: {
                    entityType: 'DispatchTask',
                    entityId: taskId,
                    action: 'DRIVER_ASSIGNED',
                    performedById: input.assignedById,
                    changes: { driverId: input.driverId, previousStatus: task.status },
                },
            });

            return updatedTask;
        });

        logger.info({ taskId, driverId: input.driverId }, 'Driver assigned to task');
        return updated;
    }

    /**
     * Driver starts pickup route.
     */
    async startPickup(taskId: string, input: StartPickupInput): Promise<DispatchTask> {
        const task = await this.prisma.dispatchTask.findUniqueOrThrow({
            where: { id: taskId },
        });

        if (task.driverId !== input.driverId) {
            throw new DispatchError('UNAUTHORIZED', 'Only assigned driver can update task');
        }

        if (!this.canTransition(task.status, 'EN_ROUTE_PICKUP')) {
            throw new DispatchError('INVALID_TRANSITION', `Cannot start pickup from ${task.status}`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedTask = await tx.dispatchTask.update({
                where: { id: taskId },
                data: {
                    status: 'EN_ROUTE_PICKUP',
                    enRoutePickupAt: new Date(),
                },
            });

            // Update driver location if provided
            if (input.locationLat && input.locationLng) {
                await tx.driver.update({
                    where: { id: input.driverId },
                    data: {
                        lastLocationLat: input.locationLat,
                        lastLocationLng: input.locationLng,
                        lastLocationAt: new Date(),
                    },
                });
            }

            await tx.auditLog.create({
                data: {
                    entityType: 'DispatchTask',
                    entityId: taskId,
                    action: 'EN_ROUTE_PICKUP',
                    performedById: input.driverId,
                    changes: { locationLat: input.locationLat, locationLng: input.locationLng },
                },
            });

            return updatedTask;
        });

        logger.info({ taskId, driverId: input.driverId }, 'Driver started pickup');
        return updated;
    }

    /**
     * Driver confirms pickup at hub.
     */
    async confirmPickup(taskId: string, input: ConfirmPickupInput): Promise<DispatchTask> {
        const task = await this.prisma.dispatchTask.findUniqueOrThrow({
            where: { id: taskId },
            include: { deliveries: true },
        });

        if (task.driverId !== input.driverId) {
            throw new DispatchError('UNAUTHORIZED', 'Only assigned driver can update task');
        }

        if (!this.canTransition(task.status, 'PICKED_UP')) {
            throw new DispatchError('INVALID_TRANSITION', `Cannot confirm pickup from ${task.status}`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedTask = await tx.dispatchTask.update({
                where: { id: taskId },
                data: {
                    status: 'PICKED_UP',
                    pickedUpAt: new Date(),
                },
            });

            // Update delivery statuses
            await tx.shipmentDelivery.updateMany({
                where: {
                    dispatchTaskId: taskId,
                    shipmentId: { in: input.pickedUpShipmentIds },
                },
                data: {
                    status: 'IN_TRANSIT',
                    pickedUpAt: new Date(),
                },
            });

            await tx.auditLog.create({
                data: {
                    entityType: 'DispatchTask',
                    entityId: taskId,
                    action: 'PICKED_UP',
                    performedById: input.driverId,
                    changes: { pickedUpShipmentIds: input.pickedUpShipmentIds, photoUrls: input.photoUrls },
                },
            });

            return updatedTask;
        });

        logger.info({ taskId, shipmentCount: input.pickedUpShipmentIds.length }, 'Pickup confirmed');
        return updated;
    }

    /**
     * Driver starts delivery route.
     */
    async startDelivery(taskId: string, input: StartDeliveryInput): Promise<DispatchTask> {
        const task = await this.prisma.dispatchTask.findUniqueOrThrow({
            where: { id: taskId },
        });

        if (task.driverId !== input.driverId) {
            throw new DispatchError('UNAUTHORIZED', 'Only assigned driver can update task');
        }

        if (!this.canTransition(task.status, 'EN_ROUTE_DELIVERY')) {
            throw new DispatchError('INVALID_TRANSITION', `Cannot start delivery from ${task.status}`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedTask = await tx.dispatchTask.update({
                where: { id: taskId },
                data: {
                    status: 'EN_ROUTE_DELIVERY',
                    enRouteDeliveryAt: new Date(),
                },
            });

            // Update all deliveries to DELIVERY_ATTEMPT
            await tx.shipmentDelivery.updateMany({
                where: { dispatchTaskId: taskId, status: 'IN_TRANSIT' },
                data: { status: 'DELIVERY_ATTEMPT' },
            });

            await tx.auditLog.create({
                data: {
                    entityType: 'DispatchTask',
                    entityId: taskId,
                    action: 'EN_ROUTE_DELIVERY',
                    performedById: input.driverId,
                },
            });

            return updatedTask;
        });

        logger.info({ taskId }, 'Driver started delivery route');
        return updated;
    }

    /**
     * Fail the task (any stage).
     */
    async failTask(taskId: string, input: FailTaskInput): Promise<DispatchTask> {
        const task = await this.prisma.dispatchTask.findUniqueOrThrow({
            where: { id: taskId },
            include: { deliveries: true },
        });

        if (!this.canTransition(task.status, 'FAILED')) {
            throw new DispatchError('INVALID_TRANSITION', `Cannot fail from ${task.status}, already terminal`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedTask = await tx.dispatchTask.update({
                where: { id: taskId },
                data: {
                    status: 'FAILED',
                    failedAt: new Date(),
                    failureReason: input.reason,
                },
            });

            // Mark all deliveries as exception
            await tx.shipmentDelivery.updateMany({
                where: {
                    dispatchTaskId: taskId,
                    status: { notIn: ['DELIVERED'] },
                },
                data: {
                    status: 'EXCEPTION',
                    failureReason: input.reason,
                },
            });

            // Revert shipment status to ARRIVED for retry
            const shipmentIds = task.deliveries.map(d => d.shipmentId);
            await tx.shipment.updateMany({
                where: { id: { in: shipmentIds } },
                data: { status: 'EXCEPTION' },
            });

            await tx.auditLog.create({
                data: {
                    entityType: 'DispatchTask',
                    entityId: taskId,
                    action: 'FAILED',
                    performedById: input.failedById,
                    changes: { reason: input.reason, previousStatus: task.status },
                },
            });

            return updatedTask;
        });

        logger.warn({ taskId, reason: input.reason }, 'DispatchTask failed');
        return updated;
    }

    /**
     * Get task with full details.
     */
    async getWithDetails(taskId: string) {
        return this.prisma.dispatchTask.findUniqueOrThrow({
            where: { id: taskId },
            include: {
                driver: { select: { id: true, userId: true, vehicleType: true, vehiclePlate: true } },
                route: { select: { id: true, code: true } },
                deliveries: {
                    include: {
                        shipment: {
                            select: {
                                id: true,
                                trackingCode: true,
                                packageDescription: true,
                                declaredWeightKg: true,
                            },
                        },
                        deliveryProof: true,
                    },
                },
            },
        });
    }

    /**
     * Get tasks by status for a hub/driver.
     */
    async getByStatus(status: DispatchTaskStatus, driverId?: string) {
        return this.prisma.dispatchTask.findMany({
            where: {
                status,
                ...(driverId && { driverId }),
            },
            include: {
                driver: { select: { id: true, vehiclePlate: true } },
                deliveries: { select: { id: true, shipmentId: true, status: true } },
            },
            orderBy: { assignedAt: 'desc' },
        });
    }

    /**
     * Get active tasks for a driver.
     */
    async getActiveForDriver(driverId: string) {
        return this.prisma.dispatchTask.findMany({
            where: {
                driverId,
                status: { notIn: ['DELIVERED', 'FAILED'] },
            },
            include: {
                deliveries: {
                    include: {
                        shipment: { select: { id: true, trackingCode: true, packageDescription: true } },
                    },
                },
            },
            orderBy: { assignedAt: 'asc' },
        });
    }
}

// ==================================================
// ERRORS
// ==================================================

export class DispatchError extends Error {
    constructor(
        public readonly code: 'INVALID_TRANSITION' | 'INVALID_SHIPMENTS' | 'SHIPMENT_LOCKED' | 'DRIVER_NOT_AVAILABLE' | 'UNAUTHORIZED',
        message: string
    ) {
        super(message);
        this.name = 'DispatchError';
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: DispatchTaskService | null = null;

export function getDispatchTaskService(prisma: PrismaClient): DispatchTaskService {
    if (!instance) {
        instance = new DispatchTaskService(prisma);
    }
    return instance;
}
