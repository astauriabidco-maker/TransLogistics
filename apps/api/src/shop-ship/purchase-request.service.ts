/**
 * PurchaseRequest Service
 * 
 * Shop & Ship business logic:
 * - Create requests from product URLs
 * - Calculate pricing (product + service + logistics)
 * - Freeze pricing on approval (immutability)
 * - Admin adjustments with audit trail
 */

import type {
    PrismaClient,
    PurchaseRequest,
    PurchaseRequestStatus,
    ServiceFeeType,
    PurchaseRequestAdjustment,
    Prisma
} from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// STATE MACHINE
// ==================================================

const ALLOWED_TRANSITIONS: Record<PurchaseRequestStatus, PurchaseRequestStatus[]> = {
    SUBMITTED: ['QUOTED', 'CANCELLED'],
    QUOTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['ORDERING', 'CANCELLED'],
    REJECTED: [], // Terminal
    ORDERING: ['AWAITING_ARRIVAL', 'CANCELLED'],
    AWAITING_ARRIVAL: ['READY_TO_SHIP', 'CANCELLED'],
    READY_TO_SHIP: ['SHIPPED'],
    SHIPPED: ['COMPLETED'],
    COMPLETED: [], // Terminal
    CANCELLED: [], // Terminal
};

// ==================================================
// PRICING TYPES
// ==================================================

export interface PricingSnapshot {
    productCostXof: number;
    serviceFeeXof: number;
    serviceFeePercent: number;
    estimatedLogisticsXof: number;
    totalXof: number;
    calculatedAt: string;
    calculatedBy?: string;
}

export interface CreatePurchaseRequestInput {
    userId: string;
    itemDescription: string;
    itemUrl?: string;
    quantity: number;
    productOptions?: Record<string, unknown>;
    notes?: string;
    sourceRegion: 'CHINA' | 'EUROPE' | 'USA';
    sourceHubId?: string;
    destinationHubId: string;
    declaredPriceXof?: number;
}

export interface QuotePurchaseRequestInput {
    estimatedPriceXof: number;
    serviceFeePercent?: number;  // Default 10%
    estimatedLogisticsXof: number;
    quotedById: string;
}

export interface AdjustmentInput {
    fieldName: string;
    newValue: string;
    reason: string;
    adjustedById: string;
}

// ==================================================
// SERVICE
// ==================================================

export class PurchaseRequestService {
    // Default service fee percentage
    private readonly DEFAULT_SERVICE_FEE_PERCENT = 10;

    constructor(private prisma: PrismaClient) { }

    /**
     * Check if a state transition is allowed.
     */
    canTransition(from: PurchaseRequestStatus, to: PurchaseRequestStatus): boolean {
        return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
    }

    /**
     * Get allowed next states.
     */
    getAllowedTransitions(from: PurchaseRequestStatus): PurchaseRequestStatus[] {
        return ALLOWED_TRANSITIONS[from] ?? [];
    }

    /**
     * Create a new purchase request.
     * Status: SUBMITTED
     */
    async create(input: CreatePurchaseRequestInput): Promise<PurchaseRequest> {
        const request = await this.prisma.purchaseRequest.create({
            data: {
                userId: input.userId,
                itemDescription: input.itemDescription,
                itemUrl: input.itemUrl,
                quantity: input.quantity,
                productOptions: input.productOptions as Prisma.InputJsonValue,
                notes: input.notes,
                sourceRegion: input.sourceRegion,
                sourceHubId: input.sourceHubId,
                destinationHubId: input.destinationHubId,
                declaredPriceXof: input.declaredPriceXof,
                status: 'SUBMITTED',
            },
        });

        logger.info({ requestId: request.id, userId: input.userId }, 'PurchaseRequest created');
        return request;
    }

    /**
     * Quote a purchase request.
     * Calculates pricing and transitions to QUOTED.
     */
    async quote(requestId: string, input: QuotePurchaseRequestInput): Promise<PurchaseRequest> {
        const request = await this.prisma.purchaseRequest.findUniqueOrThrow({
            where: { id: requestId },
        });

        // Validate transition
        if (!this.canTransition(request.status, 'QUOTED')) {
            throw new PurchaseRequestError(
                'INVALID_TRANSITION',
                `Cannot quote request in ${request.status} status`
            );
        }

        // Calculate pricing
        const serviceFeePercent = input.serviceFeePercent ?? this.DEFAULT_SERVICE_FEE_PERCENT;
        const productCostXof = input.estimatedPriceXof * request.quantity;
        const serviceFeeXof = Math.ceil(productCostXof * (serviceFeePercent / 100));
        const totalXof = productCostXof + serviceFeeXof + input.estimatedLogisticsXof;

        // Create pricing snapshot (not yet frozen, just calculated)
        const pricingSnapshot: PricingSnapshot = {
            productCostXof,
            serviceFeeXof,
            serviceFeePercent,
            estimatedLogisticsXof: input.estimatedLogisticsXof,
            totalXof,
            calculatedAt: new Date().toISOString(),
            calculatedBy: input.quotedById,
        };

        // Update request
        const updated = await this.prisma.purchaseRequest.update({
            where: { id: requestId },
            data: {
                status: 'QUOTED',
                estimatedPriceXof: input.estimatedPriceXof,
                pricingSnapshot: pricingSnapshot as unknown as Prisma.InputJsonValue,
                quotedAt: new Date(),
            },
        });

        // Create service fees
        await this.prisma.serviceFee.createMany({
            data: [
                {
                    purchaseRequestId: requestId,
                    feeType: 'PROCUREMENT',
                    amountXof: serviceFeeXof,
                    description: `${serviceFeePercent}% service fee`,
                },
                {
                    purchaseRequestId: requestId,
                    feeType: 'HANDLING',
                    amountXof: input.estimatedLogisticsXof,
                    description: 'Estimated logistics cost',
                },
            ],
        });

        logger.info({ requestId, totalXof }, 'PurchaseRequest quoted');
        return updated;
    }

    /**
     * Approve a purchase request.
     * FREEZES the pricing snapshot (immutable after this).
     */
    async approve(requestId: string, userId: string): Promise<PurchaseRequest> {
        const request = await this.prisma.purchaseRequest.findUniqueOrThrow({
            where: { id: requestId },
        });

        if (!this.canTransition(request.status, 'APPROVED')) {
            throw new PurchaseRequestError(
                'INVALID_TRANSITION',
                `Cannot approve request in ${request.status} status`
            );
        }

        if (!request.pricingSnapshot) {
            throw new PurchaseRequestError(
                'NO_PRICING',
                'Cannot approve request without pricing'
            );
        }

        const updated = await this.prisma.purchaseRequest.update({
            where: { id: requestId },
            data: {
                status: 'APPROVED',
                approvedAt: new Date(),
                confirmedById: userId,
            },
        });

        logger.info({ requestId, confirmedBy: userId }, 'PurchaseRequest approved - pricing frozen');
        return updated;
    }

    /**
     * Transition to a new status.
     * After APPROVED, most fields become immutable.
     */
    async transition(
        requestId: string,
        toStatus: PurchaseRequestStatus,
        reason?: string
    ): Promise<PurchaseRequest> {
        const request = await this.prisma.purchaseRequest.findUniqueOrThrow({
            where: { id: requestId },
        });

        if (!this.canTransition(request.status, toStatus)) {
            throw new PurchaseRequestError(
                'INVALID_TRANSITION',
                `Cannot transition from ${request.status} to ${toStatus}`
            );
        }

        const updateData: Record<string, unknown> = { status: toStatus };

        if (toStatus === 'COMPLETED') {
            updateData['completedAt'] = new Date();
        }

        const updated = await this.prisma.purchaseRequest.update({
            where: { id: requestId },
            data: updateData,
        });

        logger.info({ requestId, from: request.status, to: toStatus, reason }, 'PurchaseRequest transitioned');
        return updated;
    }

    /**
     * Admin adjustment - ONLY before APPROVED status.
     * After approval, pricing is frozen.
     */
    async adjust(
        requestId: string,
        input: AdjustmentInput
    ): Promise<{ request: PurchaseRequest; adjustment: PurchaseRequestAdjustment }> {
        const request = await this.prisma.purchaseRequest.findUniqueOrThrow({
            where: { id: requestId },
        });

        // Cannot adjust after approval (immutability)
        const immutableStatuses: PurchaseRequestStatus[] = [
            'APPROVED', 'ORDERING', 'AWAITING_ARRIVAL', 'READY_TO_SHIP',
            'SHIPPED', 'COMPLETED'
        ];

        if (immutableStatuses.includes(request.status)) {
            throw new PurchaseRequestError(
                'IMMUTABLE',
                `Cannot adjust request in ${request.status} status - pricing is frozen`
            );
        }

        // Get previous value
        const previousValue = String((request as Record<string, unknown>)[input.fieldName] ?? '');

        // Perform update and create audit in transaction
        const [updatedRequest, adjustment] = await this.prisma.$transaction([
            this.prisma.purchaseRequest.update({
                where: { id: requestId },
                data: { [input.fieldName]: input.newValue },
            }),
            this.prisma.purchaseRequestAdjustment.create({
                data: {
                    purchaseRequestId: requestId,
                    fieldName: input.fieldName,
                    previousValue,
                    newValue: input.newValue,
                    reason: input.reason,
                    adjustedById: input.adjustedById,
                },
            }),
        ]);

        logger.info(
            { requestId, field: input.fieldName, adjustedBy: input.adjustedById },
            'PurchaseRequest adjusted'
        );

        return { request: updatedRequest, adjustment };
    }

    /**
     * Get request with all related data.
     */
    async getWithDetails(requestId: string) {
        return this.prisma.purchaseRequest.findUniqueOrThrow({
            where: { id: requestId },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, phone: true } },
                sourceHub: { select: { id: true, code: true, name: true } },
                destinationHub: { select: { id: true, code: true, name: true } },
                serviceFees: true,
                adjustments: {
                    include: { adjustedBy: { select: { id: true, firstName: true, lastName: true } } },
                    orderBy: { createdAt: 'desc' },
                },
                supplierOrders: true,
            },
        });
    }

    /**
     * Get requests by status.
     */
    async getByStatus(status: PurchaseRequestStatus, options: { limit?: number; offset?: number } = {}) {
        return this.prisma.purchaseRequest.findMany({
            where: { status },
            include: {
                user: { select: { id: true, firstName: true, lastName: true } },
                destinationHub: { select: { id: true, code: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: options.limit ?? 50,
            skip: options.offset ?? 0,
        });
    }

    /**
     * Get requests by user.
     */
    async getByUser(userId: string) {
        return this.prisma.purchaseRequest.findMany({
            where: { userId },
            include: {
                serviceFees: true,
                destinationHub: { select: { id: true, code: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Get adjustment history.
     */
    async getAdjustmentHistory(requestId: string) {
        return this.prisma.purchaseRequestAdjustment.findMany({
            where: { purchaseRequestId: requestId },
            include: {
                adjustedBy: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}

// ==================================================
// ERRORS
// ==================================================

export class PurchaseRequestError extends Error {
    constructor(
        public readonly code: 'INVALID_TRANSITION' | 'NO_PRICING' | 'IMMUTABLE' | 'NOT_FOUND',
        message: string
    ) {
        super(message);
        this.name = 'PurchaseRequestError';
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: PurchaseRequestService | null = null;

export function getPurchaseRequestService(prisma: PrismaClient): PurchaseRequestService {
    if (!instance) {
        instance = new PurchaseRequestService(prisma);
    }
    return instance;
}
