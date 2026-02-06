/**
 * Consolidation Service
 * 
 * Consolidation batch management:
 * - Group SupplierOrders by user + source + destination hub
 * - Manual approval required before shipment creation
 * - Optional repackaging and item removal
 * - Create final Shipment linked to VolumeScan AI
 */

import type {
    PrismaClient,
    ConsolidationBatch,
    ConsolidationBatchStatus,
    SupplierOrder,
    Prisma
} from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// STATE MACHINE
// ==================================================

const ALLOWED_TRANSITIONS: Record<ConsolidationBatchStatus, ConsolidationBatchStatus[]> = {
    OPEN: ['CLOSED'],
    CLOSED: ['PACKED', 'OPEN'], // Can reopen if needed
    PACKED: ['SHIPMENT_CREATED'],
    SHIPMENT_CREATED: [], // Terminal
};

// ==================================================
// TYPES
// ==================================================

export interface CreateBatchInput {
    hubId: string;
    destinationHubId: string;
    userId: string;
    createdById: string;
    notes?: string;
}

export interface AddOrderToBatchInput {
    supplierOrderId: string;
    addedById: string;
}

export interface RepackagingInput {
    repackaged: boolean;
    repackagingNotes?: string;
    itemsRemoved?: { description: string; reason: string; photoUrl?: string }[];
}

export interface PackBatchInput {
    packedById: string;
    totalWeightKg: number;
    totalVolumeM3?: number;
}

export interface ApproveBatchInput {
    approvedById: string;
}

export interface CreateShipmentInput {
    createdById: string;
}

// ==================================================
// SERVICE
// ==================================================

export class ConsolidationService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Check if transition is allowed.
     */
    canTransition(from: ConsolidationBatchStatus, to: ConsolidationBatchStatus): boolean {
        return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
    }

    /**
     * Group eligible SupplierOrders for consolidation.
     * Returns orders that can be consolidated (RECEIVED status, same hub/destination).
     */
    async findEligibleForConsolidation(sourceHubId: string, destinationHubId: string, userId: string) {
        return this.prisma.supplierOrder.findMany({
            where: {
                status: 'RECEIVED',
                receivingHubId: sourceHubId,
                consolidationBatchId: null,
                purchaseRequest: {
                    userId,
                    destinationHubId,
                },
            },
            include: {
                purchaseRequest: { select: { id: true, itemDescription: true } },
                supplier: { select: { id: true, name: true } },
            },
        });
    }

    /**
     * Create a new consolidation batch.
     */
    async createBatch(input: CreateBatchInput): Promise<ConsolidationBatch> {
        const batch = await this.prisma.consolidationBatch.create({
            data: {
                hubId: input.hubId,
                destinationHubId: input.destinationHubId,
                userId: input.userId,
                createdById: input.createdById,
                notes: input.notes,
                status: 'OPEN',
            },
        });

        logger.info({ batchId: batch.id, hubId: input.hubId, userId: input.userId }, 'ConsolidationBatch created');
        return batch;
    }

    /**
     * Add a SupplierOrder to a batch.
     * Order must be RECEIVED and not already in a batch.
     */
    async addOrderToBatch(batchId: string, input: AddOrderToBatchInput): Promise<SupplierOrder> {
        const [batch, order] = await Promise.all([
            this.prisma.consolidationBatch.findUniqueOrThrow({ where: { id: batchId } }),
            this.prisma.supplierOrder.findUniqueOrThrow({
                where: { id: input.supplierOrderId },
                include: { purchaseRequest: true },
            }),
        ]);

        if (batch.status !== 'OPEN') {
            throw new ConsolidationError('BATCH_NOT_OPEN', 'Cannot add orders to non-OPEN batch');
        }

        if (order.status !== 'RECEIVED') {
            throw new ConsolidationError('INVALID_ORDER_STATUS', `Order must be RECEIVED, got ${order.status}`);
        }

        if (order.consolidationBatchId) {
            throw new ConsolidationError('ALREADY_IN_BATCH', 'Order is already in a consolidation batch');
        }

        // Validate hub matching
        if (order.receivingHubId !== batch.hubId) {
            throw new ConsolidationError('HUB_MISMATCH', 'Order receiving hub does not match batch hub');
        }

        if (order.purchaseRequest.destinationHubId !== batch.destinationHubId) {
            throw new ConsolidationError('DESTINATION_MISMATCH', 'Order destination does not match batch destination');
        }

        if (order.purchaseRequest.userId !== batch.userId) {
            throw new ConsolidationError('USER_MISMATCH', 'Order user does not match batch user');
        }

        const updated = await this.prisma.supplierOrder.update({
            where: { id: input.supplierOrderId },
            data: {
                consolidationBatchId: batchId,
                status: 'CONSOLIDATED',
            },
        });

        logger.info({ batchId, orderId: input.supplierOrderId }, 'Order added to batch');
        return updated;
    }

    /**
     * Remove an order from batch (before closing).
     */
    async removeOrderFromBatch(batchId: string, orderId: string): Promise<SupplierOrder> {
        const batch = await this.prisma.consolidationBatch.findUniqueOrThrow({ where: { id: batchId } });

        if (batch.status !== 'OPEN') {
            throw new ConsolidationError('BATCH_NOT_OPEN', 'Cannot remove orders from non-OPEN batch');
        }

        const updated = await this.prisma.supplierOrder.update({
            where: { id: orderId },
            data: {
                consolidationBatchId: null,
                status: 'RECEIVED', // Revert to RECEIVED
            },
        });

        logger.info({ batchId, orderId }, 'Order removed from batch');
        return updated;
    }

    /**
     * Close the batch (no more additions).
     */
    async closeBatch(batchId: string): Promise<ConsolidationBatch> {
        const batch = await this.prisma.consolidationBatch.findUniqueOrThrow({
            where: { id: batchId },
            include: { supplierOrders: true },
        });

        if (!this.canTransition(batch.status, 'CLOSED')) {
            throw new ConsolidationError('INVALID_TRANSITION', `Cannot close batch in ${batch.status} status`);
        }

        if (batch.supplierOrders.length === 0) {
            throw new ConsolidationError('EMPTY_BATCH', 'Cannot close empty batch');
        }

        const updated = await this.prisma.consolidationBatch.update({
            where: { id: batchId },
            data: {
                status: 'CLOSED',
                closedAt: new Date(),
                itemCount: batch.supplierOrders.length,
            },
        });

        logger.info({ batchId, itemCount: batch.supplierOrders.length }, 'Batch closed');
        return updated;
    }

    /**
     * Apply repackaging (optional, before packing).
     */
    async applyRepackaging(batchId: string, input: RepackagingInput): Promise<ConsolidationBatch> {
        const batch = await this.prisma.consolidationBatch.findUniqueOrThrow({ where: { id: batchId } });

        if (batch.status !== 'CLOSED') {
            throw new ConsolidationError('INVALID_STATUS', 'Batch must be CLOSED to apply repackaging');
        }

        const updated = await this.prisma.consolidationBatch.update({
            where: { id: batchId },
            data: {
                repackaged: input.repackaged,
                repackagingNotes: input.repackagingNotes,
                itemsRemoved: input.itemsRemoved as unknown as Prisma.InputJsonValue,
            },
        });

        logger.info({ batchId, repackaged: input.repackaged }, 'Repackaging applied');
        return updated;
    }

    /**
     * Pack the batch with weight/volume.
     */
    async packBatch(batchId: string, input: PackBatchInput): Promise<ConsolidationBatch> {
        const batch = await this.prisma.consolidationBatch.findUniqueOrThrow({ where: { id: batchId } });

        if (!this.canTransition(batch.status, 'PACKED')) {
            throw new ConsolidationError('INVALID_TRANSITION', `Cannot pack batch in ${batch.status} status`);
        }

        const updated = await this.prisma.consolidationBatch.update({
            where: { id: batchId },
            data: {
                status: 'PACKED',
                packedAt: new Date(),
                totalWeightKg: input.totalWeightKg,
                totalVolumeM3: input.totalVolumeM3,
            },
        });

        logger.info({ batchId, weight: input.totalWeightKg }, 'Batch packed');
        return updated;
    }

    /**
     * Approve the batch (required before shipment creation).
     */
    async approveBatch(batchId: string, input: ApproveBatchInput): Promise<ConsolidationBatch> {
        const batch = await this.prisma.consolidationBatch.findUniqueOrThrow({ where: { id: batchId } });

        if (batch.status !== 'PACKED') {
            throw new ConsolidationError('INVALID_STATUS', 'Batch must be PACKED to approve');
        }

        if (batch.approvedAt) {
            throw new ConsolidationError('ALREADY_APPROVED', 'Batch is already approved');
        }

        const updated = await this.prisma.consolidationBatch.update({
            where: { id: batchId },
            data: {
                approvedAt: new Date(),
                approvedById: input.approvedById,
            },
        });

        logger.info({ batchId, approvedBy: input.approvedById }, 'Batch approved');
        return updated;
    }

    /**
     * Create shipment from approved batch.
     * This integrates with the existing Shipment flow.
     */
    async createShipment(batchId: string, input: CreateShipmentInput): Promise<ConsolidationBatch> {
        const batch = await this.prisma.consolidationBatch.findUniqueOrThrow({
            where: { id: batchId },
            include: {
                supplierOrders: {
                    include: {
                        purchaseRequest: true,
                    },
                },
                hub: true,
                destinationHub: true,
                user: true,
            },
        });

        if (!this.canTransition(batch.status, 'SHIPMENT_CREATED')) {
            throw new ConsolidationError('INVALID_TRANSITION', `Cannot create shipment from ${batch.status}`);
        }

        if (!batch.approvedAt) {
            throw new ConsolidationError('NOT_APPROVED', 'Batch must be approved before creating shipment');
        }

        // Calculate total from PurchaseRequest pricing snapshots
        let totalValueXof = 0;
        for (const order of batch.supplierOrders) {
            const snapshot = order.purchaseRequest.pricingSnapshot as { totalXof?: number } | null;
            if (snapshot?.totalXof) {
                totalValueXof += snapshot.totalXof;
            }
        }

        // Mark batch as ready for shipment
        // NOTE: Actual Shipment creation is deferred to dedicated flow
        // which collects delivery addresses (Shipment model requires addresses, not hub IDs)
        const result = await this.prisma.$transaction(async (tx) => {
            // Update batch status to SHIPMENT_CREATED (ready for shipment handoff)
            const updatedBatch = await tx.consolidationBatch.update({
                where: { id: batchId },
                data: {
                    status: 'SHIPMENT_CREATED',
                    totalDeclaredValueXof: totalValueXof,
                },
            });

            // Update all PurchaseRequests to READY_TO_SHIP
            const purchaseRequestIds = [...new Set(batch.supplierOrders.map((o: { purchaseRequestId: string }) => o.purchaseRequestId))];
            await tx.purchaseRequest.updateMany({
                where: { id: { in: purchaseRequestIds } },
                data: { status: 'READY_TO_SHIP' },
            });

            return updatedBatch;
        });

        logger.info({
            batchId,
            totalValueXof,
            items: batch.supplierOrders.length,
            message: 'Batch ready for shipment - deferred to address collection flow'
        }, 'Consolidation batch ready for shipment');
        return result;
    }

    /**
     * Get batch with full details.
     */
    async getWithDetails(batchId: string) {
        return this.prisma.consolidationBatch.findUniqueOrThrow({
            where: { id: batchId },
            include: {
                hub: { select: { id: true, code: true, name: true } },
                destinationHub: { select: { id: true, code: true, name: true } },
                user: { select: { id: true, firstName: true, lastName: true, phone: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                approvedBy: { select: { id: true, firstName: true, lastName: true } },
                shipment: { select: { id: true, status: true } },
                supplierOrders: {
                    include: {
                        purchaseRequest: { select: { id: true, itemDescription: true } },
                        supplier: { select: { id: true, name: true } },
                    },
                },
            },
        });
    }

    /**
     * Get batches by status.
     */
    async getByStatus(status: ConsolidationBatchStatus, hubId?: string) {
        return this.prisma.consolidationBatch.findMany({
            where: {
                status,
                ...(hubId && { hubId }),
            },
            include: {
                user: { select: { id: true, firstName: true, lastName: true } },
                destinationHub: { select: { id: true, code: true, name: true } },
                _count: { select: { supplierOrders: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Get pending approval batches.
     */
    async getPendingApproval(hubId?: string) {
        return this.prisma.consolidationBatch.findMany({
            where: {
                status: 'PACKED',
                approvedAt: null,
                ...(hubId && { hubId }),
            },
            include: {
                user: { select: { id: true, firstName: true, lastName: true } },
                destinationHub: { select: { id: true, code: true, name: true } },
                _count: { select: { supplierOrders: true } },
            },
            orderBy: { packedAt: 'asc' },
        });
    }
}

// ==================================================
// ERRORS
// ==================================================

export class ConsolidationError extends Error {
    constructor(
        public readonly code:
            | 'INVALID_TRANSITION'
            | 'BATCH_NOT_OPEN'
            | 'INVALID_ORDER_STATUS'
            | 'ALREADY_IN_BATCH'
            | 'HUB_MISMATCH'
            | 'DESTINATION_MISMATCH'
            | 'USER_MISMATCH'
            | 'EMPTY_BATCH'
            | 'INVALID_STATUS'
            | 'ALREADY_APPROVED'
            | 'NOT_APPROVED',
        message: string
    ) {
        super(message);
        this.name = 'ConsolidationError';
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: ConsolidationService | null = null;

export function getConsolidationService(prisma: PrismaClient): ConsolidationService {
    if (!instance) {
        instance = new ConsolidationService(prisma);
    }
    return instance;
}
