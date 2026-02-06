/**
 * SupplierOrder Service
 * 
 * Supplier-side operations:
 * - Create orders from PurchaseRequest
 * - Track supplier references and invoices
 * - Hub reception flow with metadata
 * - Exception handling with audit trail
 */

import type {
    PrismaClient,
    SupplierOrder,
    SupplierOrderStatus,
    SupplierOrderExceptionType,
    Prisma
} from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// STATE MACHINE
// ==================================================

const ALLOWED_TRANSITIONS: Record<SupplierOrderStatus, SupplierOrderStatus[]> = {
    DRAFT: ['PLACED', 'CANCELLED'],
    PLACED: ['SHIPPED_TO_HUB', 'EXCEPTION', 'CANCELLED'],
    SHIPPED_TO_HUB: ['RECEIVED', 'EXCEPTION', 'CANCELLED'],
    RECEIVED: ['CONSOLIDATED', 'EXCEPTION'],
    CONSOLIDATED: [], // Terminal (goes to shipment)
    EXCEPTION: ['RECEIVED', 'CANCELLED'], // Can recover or cancel
    CANCELLED: [], // Terminal
};

// ==================================================
// TYPES
// ==================================================

export interface CreateSupplierOrderInput {
    purchaseRequestId: string;
    supplierId: string;
    receivingHubId: string;
    itemCostXof: number;
    shippingCostXof?: number;
    expectedQuantity?: number;
}

export interface PlaceOrderInput {
    orderReference?: string;
    invoiceReference?: string;
    trackingNumber?: string;
    placedById: string;
}

export interface MarkShippedInput {
    trackingNumber: string;
    shippedById: string;
}

export interface ReceiveOrderInput {
    receivedById: string;
    receivedQuantity: number;
    receptionCondition: 'GOOD' | 'DAMAGED' | 'PARTIAL';
    receptionPhotos?: string[];
    receptionNotes?: string;
}

export interface ReportExceptionInput {
    exceptionType: SupplierOrderExceptionType;
    exceptionNotes: string;
    reportedById: string;
}

export interface ResolveExceptionInput {
    resolution: string;
    resolvedById: string;
    transitionTo: 'RECEIVED' | 'CANCELLED';
}

// ==================================================
// SERVICE
// ==================================================

export class SupplierOrderService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Check if transition is allowed.
     */
    canTransition(from: SupplierOrderStatus, to: SupplierOrderStatus): boolean {
        return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
    }

    /**
     * Get allowed next states.
     */
    getAllowedTransitions(from: SupplierOrderStatus): SupplierOrderStatus[] {
        return ALLOWED_TRANSITIONS[from] ?? [];
    }

    /**
     * Create a SupplierOrder from a PurchaseRequest.
     */
    async create(input: CreateSupplierOrderInput): Promise<SupplierOrder> {
        // Validate PurchaseRequest exists and is in valid state
        const purchaseRequest = await this.prisma.purchaseRequest.findUniqueOrThrow({
            where: { id: input.purchaseRequestId },
        });

        if (!['APPROVED', 'ORDERING'].includes(purchaseRequest.status)) {
            throw new SupplierOrderError(
                'INVALID_STATE',
                `PurchaseRequest must be APPROVED or ORDERING, got ${purchaseRequest.status}`
            );
        }

        const order = await this.prisma.supplierOrder.create({
            data: {
                purchaseRequestId: input.purchaseRequestId,
                supplierId: input.supplierId,
                receivingHubId: input.receivingHubId,
                itemCostXof: input.itemCostXof,
                shippingCostXof: input.shippingCostXof,
                expectedQuantity: input.expectedQuantity ?? 1,
                status: 'DRAFT',
            },
        });

        logger.info({ orderId: order.id, purchaseRequestId: input.purchaseRequestId }, 'SupplierOrder created');
        return order;
    }

    /**
     * Mark order as placed with supplier.
     */
    async placeOrder(orderId: string, input: PlaceOrderInput): Promise<SupplierOrder> {
        const order = await this.prisma.supplierOrder.findUniqueOrThrow({
            where: { id: orderId },
        });

        if (!this.canTransition(order.status, 'PLACED')) {
            throw new SupplierOrderError('INVALID_TRANSITION', `Cannot place order in ${order.status} status`);
        }

        const updated = await this.prisma.supplierOrder.update({
            where: { id: orderId },
            data: {
                status: 'PLACED',
                orderReference: input.orderReference,
                invoiceReference: input.invoiceReference,
                trackingNumber: input.trackingNumber,
                placedAt: new Date(),
            },
        });

        logger.info({ orderId, orderReference: input.orderReference }, 'SupplierOrder placed');
        return updated;
    }

    /**
     * Mark order as shipped by supplier.
     */
    async markShipped(orderId: string, input: MarkShippedInput): Promise<SupplierOrder> {
        const order = await this.prisma.supplierOrder.findUniqueOrThrow({
            where: { id: orderId },
        });

        if (!this.canTransition(order.status, 'SHIPPED_TO_HUB')) {
            throw new SupplierOrderError('INVALID_TRANSITION', `Cannot mark shipped from ${order.status}`);
        }

        const updated = await this.prisma.supplierOrder.update({
            where: { id: orderId },
            data: {
                status: 'SHIPPED_TO_HUB',
                trackingNumber: input.trackingNumber,
                shippedAt: new Date(),
            },
        });

        logger.info({ orderId, trackingNumber: input.trackingNumber }, 'SupplierOrder shipped');
        return updated;
    }

    /**
     * Hub reception flow - mark order as received with metadata.
     */
    async receiveAtHub(orderId: string, input: ReceiveOrderInput): Promise<SupplierOrder> {
        const order = await this.prisma.supplierOrder.findUniqueOrThrow({
            where: { id: orderId },
        });

        if (!this.canTransition(order.status, 'RECEIVED')) {
            throw new SupplierOrderError('INVALID_TRANSITION', `Cannot receive from ${order.status}`);
        }

        // Auto-detect exception based on reception
        let hasException = false;
        let exceptionType: SupplierOrderExceptionType | null = null;
        let exceptionNotes: string | null = null;

        if (input.receivedQuantity < order.expectedQuantity) {
            hasException = true;
            exceptionType = 'MISSING_ITEMS';
            exceptionNotes = `Received ${input.receivedQuantity} of ${order.expectedQuantity} expected`;
        } else if (input.receptionCondition === 'DAMAGED') {
            hasException = true;
            exceptionType = 'DAMAGED';
            exceptionNotes = input.receptionNotes ?? 'Items damaged on arrival';
        }

        const updated = await this.prisma.supplierOrder.update({
            where: { id: orderId },
            data: {
                status: hasException ? 'EXCEPTION' : 'RECEIVED',
                receivedAt: new Date(),
                receivedById: input.receivedById,
                receivedQuantity: input.receivedQuantity,
                receptionPhotos: input.receptionPhotos as Prisma.InputJsonValue,
                receptionCondition: input.receptionCondition,
                receptionNotes: input.receptionNotes,
                ...(hasException && {
                    exceptionType,
                    exceptionNotes,
                    exceptionReportedAt: new Date(),
                }),
            },
        });

        if (hasException) {
            logger.warn({ orderId, exceptionType }, 'SupplierOrder received with exception');
        } else {
            logger.info({ orderId, receivedQuantity: input.receivedQuantity }, 'SupplierOrder received at hub');
        }

        return updated;
    }

    /**
     * Report an exception (manual).
     */
    async reportException(orderId: string, input: ReportExceptionInput): Promise<SupplierOrder> {
        const order = await this.prisma.supplierOrder.findUniqueOrThrow({
            where: { id: orderId },
        });

        if (!this.canTransition(order.status, 'EXCEPTION')) {
            throw new SupplierOrderError('INVALID_TRANSITION', `Cannot report exception from ${order.status}`);
        }

        const updated = await this.prisma.supplierOrder.update({
            where: { id: orderId },
            data: {
                status: 'EXCEPTION',
                exceptionType: input.exceptionType,
                exceptionNotes: input.exceptionNotes,
                exceptionReportedAt: new Date(),
            },
        });

        logger.warn({ orderId, exceptionType: input.exceptionType }, 'SupplierOrder exception reported');
        return updated;
    }

    /**
     * Resolve an exception (admin action required).
     */
    async resolveException(orderId: string, input: ResolveExceptionInput): Promise<SupplierOrder> {
        const order = await this.prisma.supplierOrder.findUniqueOrThrow({
            where: { id: orderId },
        });

        if (order.status !== 'EXCEPTION') {
            throw new SupplierOrderError('INVALID_STATE', 'Order is not in EXCEPTION status');
        }

        if (!this.canTransition(order.status, input.transitionTo)) {
            throw new SupplierOrderError('INVALID_TRANSITION', `Cannot resolve to ${input.transitionTo}`);
        }

        const updated = await this.prisma.supplierOrder.update({
            where: { id: orderId },
            data: {
                status: input.transitionTo,
                exceptionResolvedAt: new Date(),
                exceptionResolvedById: input.resolvedById,
                exceptionResolution: input.resolution,
            },
        });

        logger.info({ orderId, resolution: input.resolution, to: input.transitionTo }, 'SupplierOrder exception resolved');
        return updated;
    }

    /**
     * Cancel an order.
     */
    async cancel(orderId: string, reason: string): Promise<SupplierOrder> {
        const order = await this.prisma.supplierOrder.findUniqueOrThrow({
            where: { id: orderId },
        });

        if (!this.canTransition(order.status, 'CANCELLED')) {
            throw new SupplierOrderError('INVALID_TRANSITION', `Cannot cancel from ${order.status}`);
        }

        const updated = await this.prisma.supplierOrder.update({
            where: { id: orderId },
            data: {
                status: 'CANCELLED',
                exceptionNotes: order.exceptionNotes
                    ? `${order.exceptionNotes}\n\nCancellation: ${reason}`
                    : `Cancelled: ${reason}`,
            },
        });

        logger.info({ orderId, reason }, 'SupplierOrder cancelled');
        return updated;
    }

    /**
     * Get order with full details.
     */
    async getWithDetails(orderId: string) {
        return this.prisma.supplierOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: {
                purchaseRequest: {
                    select: { id: true, itemDescription: true, userId: true },
                },
                supplier: { select: { id: true, name: true, country: true } },
                receivingHub: { select: { id: true, code: true, name: true } },
                receivedBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
    }

    /**
     * Get orders by status.
     */
    async getByStatus(status: SupplierOrderStatus, hubId?: string) {
        return this.prisma.supplierOrder.findMany({
            where: {
                status,
                ...(hubId && { receivingHubId: hubId }),
            },
            include: {
                purchaseRequest: { select: { id: true, itemDescription: true } },
                supplier: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Get orders with exceptions (pending resolution).
     */
    async getPendingExceptions(hubId?: string) {
        return this.prisma.supplierOrder.findMany({
            where: {
                status: 'EXCEPTION',
                exceptionResolvedAt: null,
                ...(hubId && { receivingHubId: hubId }),
            },
            include: {
                purchaseRequest: { select: { id: true, itemDescription: true, userId: true } },
                supplier: { select: { id: true, name: true } },
                receivingHub: { select: { id: true, code: true, name: true } },
            },
            orderBy: { exceptionReportedAt: 'asc' },
        });
    }

    /**
     * Get orders by PurchaseRequest.
     */
    async getByPurchaseRequest(purchaseRequestId: string) {
        return this.prisma.supplierOrder.findMany({
            where: { purchaseRequestId },
            include: {
                supplier: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Get orders awaiting reception at a hub.
     */
    async getAwaitingReception(hubId: string) {
        return this.prisma.supplierOrder.findMany({
            where: {
                receivingHubId: hubId,
                status: 'SHIPPED_TO_HUB',
            },
            include: {
                purchaseRequest: { select: { id: true, itemDescription: true } },
                supplier: { select: { id: true, name: true } },
            },
            orderBy: { shippedAt: 'asc' },
        });
    }
}

// ==================================================
// ERRORS
// ==================================================

export class SupplierOrderError extends Error {
    constructor(
        public readonly code: 'INVALID_TRANSITION' | 'INVALID_STATE' | 'NOT_FOUND',
        message: string
    ) {
        super(message);
        this.name = 'SupplierOrderError';
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: SupplierOrderService | null = null;

export function getSupplierOrderService(prisma: PrismaClient): SupplierOrderService {
    if (!instance) {
        instance = new SupplierOrderService(prisma);
    }
    return instance;
}
