/**
 * Delivery Proof Service
 * 
 * Proof of delivery management:
 * - Photo capture
 * - Signature capture
 * - GPS location validation
 * - Immutable after creation
 */

import type {
    PrismaClient,
    DeliveryProof,
    DeliveryProofType,
    ShipmentDeliveryStatus,
} from '@prisma/client';
import { logger } from '../lib/logger';

// ==================================================
// CONSTANTS
// ==================================================

// GPS proximity tolerance in meters (100m for African urban conditions)
const GPS_TOLERANCE_METERS = 100;

// ==================================================
// TYPES
// ==================================================

export interface CreateDeliveryProofInput {
    shipmentDeliveryId: string;
    proofType: DeliveryProofType;

    // Evidence
    photoUrls?: string[];
    signatureUrl?: string;
    otpCode?: string;

    // Location
    capturedLat: number;
    capturedLng: number;

    // Recipient
    recipientName: string;
    notes?: string;

    // Driver context
    driverId: string;
}

export interface ValidateProofInput {
    proofId: string;
    validatedById: string;
}

// ==================================================
// HELPERS
// ==================================================

/**
 * Calculate distance between two GPS coordinates (Haversine formula).
 * Returns distance in meters.
 */
function calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ==================================================
// SERVICE
// ==================================================

export class DeliveryProofService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Create delivery proof and complete the delivery.
     * This is the PRIMARY way to mark a delivery as complete.
     */
    async createProof(input: CreateDeliveryProofInput): Promise<DeliveryProof> {
        // Get shipment delivery with dispatch task
        const delivery = await this.prisma.shipmentDelivery.findUniqueOrThrow({
            where: { id: input.shipmentDeliveryId },
            include: {
                dispatchTask: true,
                shipment: {
                    select: {
                        id: true,
                        destAddressLine1: true,
                        destCity: true,
                    },
                },
            },
        });

        // Validate driver owns this delivery
        if (delivery.dispatchTask.driverId !== input.driverId) {
            throw new DeliveryProofError('UNAUTHORIZED', 'Only assigned driver can create proof');
        }

        // Validate delivery is in correct state
        if (delivery.status !== 'DELIVERY_ATTEMPT') {
            throw new DeliveryProofError(
                'INVALID_STATE',
                `Delivery must be in DELIVERY_ATTEMPT state, got ${delivery.status}`
            );
        }

        // Validate proof type requirements
        this.validateProofRequirements(input);

        // Create proof and update delivery in transaction
        const proof = await this.prisma.$transaction(async (tx) => {
            // Create immutable proof
            const deliveryProof = await tx.deliveryProof.create({
                data: {
                    shipmentDeliveryId: input.shipmentDeliveryId,
                    proofType: input.proofType,
                    photoUrls: input.photoUrls ?? [],
                    signatureUrl: input.signatureUrl,
                    otpCode: input.otpCode,
                    capturedLat: input.capturedLat,
                    capturedLng: input.capturedLng,
                    capturedAt: new Date(),
                    recipientName: input.recipientName,
                    notes: input.notes,
                },
            });

            // Update delivery status to DELIVERED
            await tx.shipmentDelivery.update({
                where: { id: input.shipmentDeliveryId },
                data: {
                    status: 'DELIVERED',
                    deliveredAt: new Date(),
                    deliveryProofId: deliveryProof.id,
                    recipientName: input.recipientName,
                },
            });

            // Update shipment status
            await tx.shipment.update({
                where: { id: delivery.shipmentId },
                data: {
                    status: 'DELIVERED',
                    deliveredAt: new Date(),
                },
            });

            // Check if all deliveries in task are complete
            const pendingDeliveries = await tx.shipmentDelivery.count({
                where: {
                    dispatchTaskId: delivery.dispatchTaskId,
                    status: { not: 'DELIVERED' },
                },
            });

            // If all done, mark task as DELIVERED
            if (pendingDeliveries === 0) {
                await tx.dispatchTask.update({
                    where: { id: delivery.dispatchTaskId },
                    data: {
                        status: 'DELIVERED',
                        deliveredAt: new Date(),
                    },
                });
            }

            // Audit log
            await tx.auditLog.create({
                data: {
                    entityType: 'DeliveryProof',
                    entityId: deliveryProof.id,
                    action: 'CREATED',
                    performedById: input.driverId,
                    changes: {
                        shipmentId: delivery.shipmentId,
                        proofType: input.proofType,
                        capturedLat: input.capturedLat,
                        capturedLng: input.capturedLng,
                    },
                },
            });

            return deliveryProof;
        });

        logger.info(
            {
                proofId: proof.id,
                shipmentId: delivery.shipmentId,
                proofType: input.proofType
            },
            'Delivery proof created'
        );

        return proof;
    }

    /**
     * Validate proof requirements based on type.
     */
    private validateProofRequirements(input: CreateDeliveryProofInput): void {
        switch (input.proofType) {
            case 'SIGNATURE':
                if (!input.signatureUrl) {
                    throw new DeliveryProofError('MISSING_EVIDENCE', 'Signature URL required for SIGNATURE proof');
                }
                break;

            case 'PHOTO':
                if (!input.photoUrls || input.photoUrls.length === 0) {
                    throw new DeliveryProofError('MISSING_EVIDENCE', 'At least one photo required for PHOTO proof');
                }
                break;

            case 'OTP':
                if (!input.otpCode) {
                    throw new DeliveryProofError('MISSING_EVIDENCE', 'OTP code required for OTP proof');
                }
                break;

            case 'RECIPIENT_ABSENT':
                if (!input.photoUrls || input.photoUrls.length === 0) {
                    throw new DeliveryProofError(
                        'MISSING_EVIDENCE',
                        'Photo required when recipient is absent'
                    );
                }
                if (!input.notes) {
                    throw new DeliveryProofError(
                        'MISSING_EVIDENCE',
                        'Notes required when recipient is absent (who received it)'
                    );
                }
                break;

            default:
                throw new DeliveryProofError('INVALID_TYPE', `Unknown proof type: ${input.proofType}`);
        }

        // Validate GPS coordinates are present
        if (input.capturedLat === undefined || input.capturedLng === undefined) {
            throw new DeliveryProofError('MISSING_LOCATION', 'GPS coordinates required');
        }

        // Validate recipient name
        if (!input.recipientName || input.recipientName.trim().length === 0) {
            throw new DeliveryProofError('MISSING_RECIPIENT', 'Recipient name required');
        }
    }

    /**
     * Validate GPS proximity to destination.
     * Returns true if within tolerance, false otherwise.
     * NOTE: This is a soft validation - we log warnings but don't block.
     */
    async validateGpsProximity(
        proofId: string,
        destinationLat: number,
        destinationLng: number
    ): Promise<{ valid: boolean; distance: number }> {
        const proof = await this.prisma.deliveryProof.findUniqueOrThrow({
            where: { id: proofId },
        });

        const distance = calculateDistance(
            Number(proof.capturedLat),
            Number(proof.capturedLng),
            destinationLat,
            destinationLng
        );

        const valid = distance <= GPS_TOLERANCE_METERS;

        if (!valid) {
            logger.warn(
                { proofId, distance, tolerance: GPS_TOLERANCE_METERS },
                'Delivery proof captured outside GPS tolerance'
            );
        }

        return { valid, distance };
    }

    /**
     * Record a failed delivery attempt.
     */
    async recordFailedAttempt(
        shipmentDeliveryId: string,
        input: { reason: string; driverId: string; photoUrls?: string[]; lat?: number; lng?: number }
    ): Promise<void> {
        const delivery = await this.prisma.shipmentDelivery.findUniqueOrThrow({
            where: { id: shipmentDeliveryId },
            include: { dispatchTask: true },
        });

        if (delivery.dispatchTask.driverId !== input.driverId) {
            throw new DeliveryProofError('UNAUTHORIZED', 'Only assigned driver can record failed attempt');
        }

        await this.prisma.$transaction(async (tx) => {
            const newAttemptCount = delivery.attemptCount + 1;
            const maxAttempts = 3;

            // Determine next status based on attempt count
            const nextStatus: ShipmentDeliveryStatus =
                newAttemptCount >= maxAttempts ? 'RETURNED_TO_HUB' : 'PENDING_RETRY';

            await tx.shipmentDelivery.update({
                where: { id: shipmentDeliveryId },
                data: {
                    attemptCount: newAttemptCount,
                    lastAttemptAt: new Date(),
                    failureReason: input.reason,
                    status: nextStatus,
                },
            });

            // If returned to hub, revert shipment status
            if (nextStatus === 'RETURNED_TO_HUB') {
                await tx.shipment.update({
                    where: { id: delivery.shipmentId },
                    data: { status: 'EXCEPTION' },
                });
            }

            await tx.auditLog.create({
                data: {
                    entityType: 'ShipmentDelivery',
                    entityId: shipmentDeliveryId,
                    action: 'FAILED_ATTEMPT',
                    performedById: input.driverId,
                    changes: {
                        attemptCount: newAttemptCount,
                        reason: input.reason,
                        nextStatus,
                        lat: input.lat,
                        lng: input.lng,
                    },
                },
            });
        });

        logger.warn(
            { deliveryId: shipmentDeliveryId, attemptCount: delivery.attemptCount + 1, reason: input.reason },
            'Failed delivery attempt recorded'
        );
    }

    /**
     * Get proof by ID.
     */
    async getById(proofId: string): Promise<DeliveryProof> {
        return this.prisma.deliveryProof.findUniqueOrThrow({
            where: { id: proofId },
        });
    }

    /**
     * Get proof with delivery and shipment details.
     */
    async getWithDetails(proofId: string) {
        return this.prisma.deliveryProof.findUniqueOrThrow({
            where: { id: proofId },
            include: {
                shipmentDelivery: {
                    include: {
                        shipment: {
                            select: {
                                id: true,
                                trackingCode: true,
                                packageDescription: true,
                                destAddressLine1: true,
                                destCity: true,
                            },
                        },
                        dispatchTask: {
                            select: { id: true, driverId: true },
                        },
                    },
                },
            },
        });
    }
}

// ==================================================
// ERRORS
// ==================================================

export class DeliveryProofError extends Error {
    constructor(
        public readonly code:
            | 'UNAUTHORIZED'
            | 'INVALID_STATE'
            | 'MISSING_EVIDENCE'
            | 'MISSING_LOCATION'
            | 'MISSING_RECIPIENT'
            | 'INVALID_TYPE',
        message: string
    ) {
        super(message);
        this.name = 'DeliveryProofError';
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: DeliveryProofService | null = null;

export function getDeliveryProofService(prisma: PrismaClient): DeliveryProofService {
    if (!instance) {
        instance = new DeliveryProofService(prisma);
    }
    return instance;
}
