/**
 * Route Plan Service
 * 
 * Manages RoutePlan lifecycle:
 * - Create plans with optimized task order
 * - Approve/start/complete plans
 * - Track execution progress
 */

import type { PrismaClient, RoutePlan, RoutePlanStatus } from '@prisma/client';
import { logger } from '../lib/logger';
import { getRouteOptimizationService, type OptimizedRoute } from './route-optimization.service';

// ==================================================
// STATE MACHINE
// ==================================================

const ALLOWED_TRANSITIONS: Record<RoutePlanStatus, RoutePlanStatus[]> = {
    DRAFT: ['APPROVED', 'CANCELLED'],
    APPROVED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [], // Terminal
    CANCELLED: [], // Terminal
};

// ==================================================
// TYPES
// ==================================================

export interface CreateRoutePlanInput {
    driverId: string;
    vehicleId: string;
    hubId: string;
    planDate: Date;
    createdById: string;
    dispatchTaskIds?: string[];
}

export interface OptimizeRoutePlanInput {
    routePlanId: string;
    optimizerId: string;
}

// ==================================================
// SERVICE
// ==================================================

export class RoutePlanService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Check if transition is allowed.
     */
    canTransition(from: RoutePlanStatus, to: RoutePlanStatus): boolean {
        return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
    }

    /**
     * Create a new route plan for a driver.
     */
    async create(input: CreateRoutePlanInput): Promise<RoutePlan> {
        // Validate driver
        const driver = await this.prisma.driver.findUniqueOrThrow({
            where: { id: input.driverId },
        });

        if (driver.status !== 'ACTIVE') {
            throw new RoutePlanError('DRIVER_UNAVAILABLE', `Driver is ${driver.status}`);
        }

        // Validate vehicle
        const vehicle = await this.prisma.vehicle.findUniqueOrThrow({
            where: { id: input.vehicleId },
        });

        if (vehicle.status !== 'AVAILABLE' && vehicle.status !== 'IN_USE') {
            throw new RoutePlanError('VEHICLE_UNAVAILABLE', `Vehicle is ${vehicle.status}`);
        }

        // Check no existing plan for driver on this date
        const existingPlan = await this.prisma.routePlan.findUnique({
            where: {
                driverId_planDate: {
                    driverId: input.driverId,
                    planDate: input.planDate,
                },
            },
        });

        if (existingPlan) {
            throw new RoutePlanError('DUPLICATE_PLAN', 'Driver already has a plan for this date');
        }

        const plan = await this.prisma.$transaction(async (tx) => {
            const routePlan = await tx.routePlan.create({
                data: {
                    status: 'DRAFT',
                    planDate: input.planDate,
                    driverId: input.driverId,
                    vehicleId: input.vehicleId,
                    hubId: input.hubId,
                    createdById: input.createdById,
                    totalTasks: input.dispatchTaskIds?.length ?? 0,
                },
            });

            // Link dispatch tasks if provided
            if (input.dispatchTaskIds && input.dispatchTaskIds.length > 0) {
                await tx.dispatchTask.updateMany({
                    where: { id: { in: input.dispatchTaskIds } },
                    data: { routePlanId: routePlan.id },
                });
            }

            await tx.auditLog.create({
                data: {
                    entityType: 'RoutePlan',
                    entityId: routePlan.id,
                    action: 'CREATED',
                    performedById: input.createdById,
                    changes: {
                        driverId: input.driverId,
                        vehicleId: input.vehicleId,
                        planDate: input.planDate,
                        taskCount: input.dispatchTaskIds?.length ?? 0,
                    },
                },
            });

            return routePlan;
        });

        logger.info({ planId: plan.id, driverId: input.driverId }, 'RoutePlan created');
        return plan;
    }

    /**
     * Optimize the route and get suggested order.
     * Does NOT modify the plan, returns suggestion only.
     * 
     * NOTE: In v1, we don't have precise lat/lng for shipments.
     * This method provides ordering based on available address data
     * or returns deliveries in creation order with time estimates.
     */
    async optimizeRoute(routePlanId: string): Promise<OptimizedRoute> {
        const plan = await this.prisma.routePlan.findUniqueOrThrow({
            where: { id: routePlanId },
            include: {
                hub: true,
                dispatchTasks: {
                    include: {
                        deliveries: {
                            include: {
                                shipment: {
                                    select: {
                                        id: true,
                                        destAddressLine1: true,
                                        destCity: true,
                                        declaredWeightKg: true,
                                    },
                                },
                            },
                        },
                    },
                },
                vehicle: true,
            },
        });

        const optimizer = getRouteOptimizationService();

        // Build stops from deliveries
        // v1: Use hub location as placeholder (no geocoding yet)
        const hubLat = Number(plan.hub.latitude) || 5.56; // Default: Abidjan
        const hubLng = Number(plan.hub.longitude) || -4.01;

        const stops = plan.dispatchTasks.flatMap((task) =>
            task.deliveries.map((d) => ({
                id: d.shipmentId,
                name: d.shipment.destAddressLine1 ?? 'Unknown',
                // v1: Use hub location with small offset to simulate spread
                lat: hubLat + (Math.random() - 0.5) * 0.02,
                lng: hubLng + (Math.random() - 0.5) * 0.02,
                demandKg: Number(d.shipment.declaredWeightKg) || 0,
                locationQuality: 'APPROXIMATE' as const, // v1 limitation
            }))
        );

        return optimizer.optimizeRoute({
            depotLat: hubLat,
            depotLng: hubLng,
            stops,
            vehicle: {
                capacityKg: Number(plan.vehicle.capacityKg),
                maxStops: 20, // Default max
            },
            returnToDepot: true,
        });
    }

    /**
     * Approve plan for execution.
     */
    async approve(planId: string, approvedById: string): Promise<RoutePlan> {
        const plan = await this.prisma.routePlan.findUniqueOrThrow({
            where: { id: planId },
        });

        if (!this.canTransition(plan.status, 'APPROVED')) {
            throw new RoutePlanError('INVALID_TRANSITION', `Cannot approve from ${plan.status}`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedPlan = await tx.routePlan.update({
                where: { id: planId },
                data: {
                    status: 'APPROVED',
                    approvedById,
                    approvedAt: new Date(),
                },
            });

            await tx.auditLog.create({
                data: {
                    entityType: 'RoutePlan',
                    entityId: planId,
                    action: 'APPROVED',
                    performedById: approvedById,
                },
            });

            return updatedPlan;
        });

        logger.info({ planId }, 'RoutePlan approved');
        return updated;
    }

    /**
     * Start executing the route plan.
     */
    async start(planId: string, driverId: string): Promise<RoutePlan> {
        const plan = await this.prisma.routePlan.findUniqueOrThrow({
            where: { id: planId },
        });

        if (plan.driverId !== driverId) {
            throw new RoutePlanError('UNAUTHORIZED', 'Only assigned driver can start plan');
        }

        if (!this.canTransition(plan.status, 'IN_PROGRESS')) {
            throw new RoutePlanError('INVALID_TRANSITION', `Cannot start from ${plan.status}`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedPlan = await tx.routePlan.update({
                where: { id: planId },
                data: {
                    status: 'IN_PROGRESS',
                    startedAt: new Date(),
                },
            });

            // Mark vehicle as IN_USE
            await tx.vehicle.update({
                where: { id: plan.vehicleId },
                data: { status: 'IN_USE', currentDriverId: driverId },
            });

            await tx.auditLog.create({
                data: {
                    entityType: 'RoutePlan',
                    entityId: planId,
                    action: 'STARTED',
                    performedById: driverId,
                },
            });

            return updatedPlan;
        });

        logger.info({ planId, driverId }, 'RoutePlan started');
        return updated;
    }

    /**
     * Complete the route plan.
     */
    async complete(planId: string, driverId: string, totalKm?: number): Promise<RoutePlan> {
        const plan = await this.prisma.routePlan.findUniqueOrThrow({
            where: { id: planId },
            include: { dispatchTasks: true },
        });

        if (plan.driverId !== driverId) {
            throw new RoutePlanError('UNAUTHORIZED', 'Only assigned driver can complete plan');
        }

        if (!this.canTransition(plan.status, 'COMPLETED')) {
            throw new RoutePlanError('INVALID_TRANSITION', `Cannot complete from ${plan.status}`);
        }

        const completedTasks = plan.dispatchTasks.filter(
            t => t.status === 'DELIVERED' || t.status === 'FAILED'
        ).length;

        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedPlan = await tx.routePlan.update({
                where: { id: planId },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    completedTasks,
                    totalKm: totalKm ?? undefined,
                },
            });

            // Mark vehicle as available
            await tx.vehicle.update({
                where: { id: plan.vehicleId },
                data: { status: 'AVAILABLE', currentDriverId: null },
            });

            await tx.auditLog.create({
                data: {
                    entityType: 'RoutePlan',
                    entityId: planId,
                    action: 'COMPLETED',
                    performedById: driverId,
                    changes: { completedTasks, totalTasks: plan.totalTasks, totalKm },
                },
            });

            return updatedPlan;
        });

        logger.info({ planId, completedTasks, totalTasks: plan.totalTasks }, 'RoutePlan completed');
        return updated;
    }

    /**
     * Get plan with details.
     */
    async getWithDetails(planId: string) {
        return this.prisma.routePlan.findUniqueOrThrow({
            where: { id: planId },
            include: {
                driver: { select: { id: true, userId: true, vehiclePlate: true } },
                vehicle: { select: { id: true, plateNumber: true, type: true, capacityKg: true } },
                hub: { select: { id: true, name: true, code: true } },
                dispatchTasks: {
                    include: {
                        deliveries: {
                            include: {
                                shipment: { select: { id: true, trackingCode: true } },
                            },
                        },
                    },
                },
            },
        });
    }

    /**
     * Get plans for a driver by date.
     */
    async getForDriver(driverId: string, date?: Date) {
        return this.prisma.routePlan.findMany({
            where: {
                driverId,
                ...(date && { planDate: date }),
            },
            include: {
                dispatchTasks: { select: { id: true, status: true } },
            },
            orderBy: { planDate: 'desc' },
        });
    }
}

// ==================================================
// ERRORS
// ==================================================

export class RoutePlanError extends Error {
    constructor(
        public readonly code:
            | 'DRIVER_UNAVAILABLE'
            | 'VEHICLE_UNAVAILABLE'
            | 'DUPLICATE_PLAN'
            | 'INVALID_TRANSITION'
            | 'UNAUTHORIZED',
        message: string
    ) {
        super(message);
        this.name = 'RoutePlanError';
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: RoutePlanService | null = null;

export function getRoutePlanService(prisma: PrismaClient): RoutePlanService {
    if (!instance) {
        instance = new RoutePlanService(prisma);
    }
    return instance;
}
