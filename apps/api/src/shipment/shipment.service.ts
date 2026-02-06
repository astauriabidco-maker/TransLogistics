/**
 * Shipment Lifecycle Service
 * 
 * State machine for shipment transitions with append-only event history.
 */

import type { PrismaClient, ShipmentStatus, Shipment, ShipmentEvent } from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// STATE MACHINE DEFINITION
// ==================================================

/**
 * Allowed state transitions.
 * Key = current status, Value = array of allowed next statuses
 */
const ALLOWED_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
    DRAFT: ['CREATED', 'CANCELLED'],
    CREATED: ['RECEIVED_AT_HUB', 'EXCEPTION', 'CANCELLED'],
    RECEIVED_AT_HUB: ['IN_TRANSIT', 'EXCEPTION', 'CANCELLED'],
    IN_TRANSIT: ['ARRIVED', 'EXCEPTION', 'CANCELLED'],
    ARRIVED: ['OUT_FOR_DELIVERY', 'EXCEPTION', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'EXCEPTION', 'CANCELLED'],
    DELIVERED: [], // Terminal state
    EXCEPTION: ['CREATED', 'RECEIVED_AT_HUB', 'IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY', 'CANCELLED'], // Can resolve to any previous state
    CANCELLED: [], // Terminal state
};

// ==================================================
// TYPES
// ==================================================

export interface TransitionOptions {
    reason?: string;
    metadata?: Record<string, unknown>;
    hubId?: string;
    userId?: string;
}

export interface ShipmentWithEvents extends Shipment {
    events: ShipmentEvent[];
}

export class ShipmentError extends Error {
    constructor(
        public code: 'INVALID_TRANSITION' | 'SHIPMENT_NOT_FOUND' | 'PAYMENT_NOT_FOUND' | 'SHIPMENT_EXISTS',
        message: string
    ) {
        super(message);
        this.name = 'ShipmentError';
    }
}

// ==================================================
// SERVICE
// ==================================================

export class ShipmentService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Check if a state transition is allowed.
     */
    canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
        const allowed = ALLOWED_TRANSITIONS[from];
        return allowed?.includes(to) ?? false;
    }

    /**
     * Get all allowed next states from current status.
     */
    getAllowedTransitions(from: ShipmentStatus): ShipmentStatus[] {
        return ALLOWED_TRANSITIONS[from] || [];
    }

    /**
     * Create operational shipment after payment confirmation.
     * Transitions from DRAFT → CREATED and logs the event.
     */
    async createFromPayment(paymentId: string): Promise<ShipmentWithEvents> {
        // Find payment and associated shipment
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: { shipment: true },
        });

        if (!payment) {
            throw new ShipmentError('PAYMENT_NOT_FOUND', `Payment ${paymentId} not found`);
        }

        if (!payment.shipment) {
            throw new ShipmentError('SHIPMENT_NOT_FOUND', `No shipment linked to payment ${paymentId}`);
        }

        const shipment = payment.shipment;

        // Check if already operational
        if (shipment.status !== 'DRAFT') {
            logger.info({ shipmentId: shipment.id, status: shipment.status }, 'Shipment already operational');
            return this.getShipmentWithEvents(shipment.id);
        }

        // Transition to CREATED
        return this.transition(shipment.id, 'CREATED', {
            reason: 'Payment confirmed',
            metadata: { paymentId, paymentProvider: payment.provider },
        });
    }

    /**
     * Transition shipment to a new state.
     * Validates transition and logs event.
     */
    async transition(
        shipmentId: string,
        toStatus: ShipmentStatus,
        options: TransitionOptions = {}
    ): Promise<ShipmentWithEvents> {
        const shipment = await this.prisma.shipment.findUnique({
            where: { id: shipmentId },
        });

        if (!shipment) {
            throw new ShipmentError('SHIPMENT_NOT_FOUND', `Shipment ${shipmentId} not found`);
        }

        const fromStatus = shipment.status;

        // Validate transition
        if (!this.canTransition(fromStatus, toStatus)) {
            throw new ShipmentError(
                'INVALID_TRANSITION',
                `Cannot transition from ${fromStatus} to ${toStatus}. Allowed: ${this.getAllowedTransitions(fromStatus).join(', ')}`
            );
        }

        // Prepare timestamp updates
        const timestampUpdates: Record<string, Date> = {};
        const now = new Date();

        switch (toStatus) {
            case 'CREATED':
                timestampUpdates['confirmedAt'] = now;
                break;
            case 'IN_TRANSIT':
                timestampUpdates['inTransitAt'] = now;
                break;
            case 'OUT_FOR_DELIVERY':
                timestampUpdates['outForDeliveryAt'] = now;
                break;
            case 'DELIVERED':
                timestampUpdates['deliveredAt'] = now;
                break;
            case 'CANCELLED':
                timestampUpdates['cancelledAt'] = now;
                break;
        }

        // Execute in transaction
        const [updatedShipment] = await this.prisma.$transaction([
            // Update shipment status
            this.prisma.shipment.update({
                where: { id: shipmentId },
                data: {
                    status: toStatus,
                    ...timestampUpdates,
                    ...(toStatus === 'CANCELLED' && options.reason ? { cancellationReason: options.reason } : {}),
                },
            }),
            // Create event (append-only log)
            this.prisma.shipmentEvent.create({
                data: {
                    shipmentId,
                    fromStatus,
                    toStatus,
                    reason: options.reason,
                    metadata: options.metadata ? options.metadata : undefined,
                    hubId: options.hubId,
                    createdById: options.userId,
                },
            }),
        ]);

        logger.info(
            {
                shipmentId,
                fromStatus,
                toStatus,
                reason: options.reason,
                hubId: options.hubId,
                userId: options.userId,
            },
            'Shipment state transitioned'
        );

        return this.getShipmentWithEvents(updatedShipment.id);
    }

    /**
     * Get shipment with full event history.
     */
    async getShipmentWithEvents(shipmentId: string): Promise<ShipmentWithEvents> {
        const shipment = await this.prisma.shipment.findUnique({
            where: { id: shipmentId },
            include: {
                events: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!shipment) {
            throw new ShipmentError('SHIPMENT_NOT_FOUND', `Shipment ${shipmentId} not found`);
        }

        return shipment;
    }

    /**
     * Get event history for a shipment (append-only log).
     */
    async getHistory(shipmentId: string): Promise<ShipmentEvent[]> {
        const events = await this.prisma.shipmentEvent.findMany({
            where: { shipmentId },
            orderBy: { createdAt: 'asc' },
        });

        return events;
    }

    /**
     * Get shipments by status for admin dashboards.
     */
    async getByStatus(
        status: ShipmentStatus,
        options: { hubId?: string; limit?: number; offset?: number } = {}
    ): Promise<Shipment[]> {
        const where: Record<string, unknown> = { status };

        if (options.hubId) {
            where['route'] = {
                OR: [{ originHubId: options.hubId }, { destinationHubId: options.hubId }],
            };
        }

        return this.prisma.shipment.findMany({
            where,
            take: options.limit || 50,
            skip: options.offset || 0,
            orderBy: { updatedAt: 'desc' },
        });
    }
}

// ==================================================
// SINGLETON
// ==================================================

let shipmentServiceInstance: ShipmentService | null = null;

export function getShipmentService(prisma: PrismaClient): ShipmentService {
    if (!shipmentServiceInstance) {
        shipmentServiceInstance = new ShipmentService(prisma);
    }
    return shipmentServiceInstance;
}
