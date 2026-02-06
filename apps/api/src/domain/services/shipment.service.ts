/**
 * ShipmentService Interface
 * 
 * Manages shipment lifecycle from creation to delivery.
 * Orchestrates interactions with Quote, Payment, and Dispatch services.
 */

import type {
    ServiceContext,
    ShipmentStatus,
    Address,
    PaginatedResult,
    PaginationParams
} from './types';

// ==================================================
// INPUT TYPES
// ==================================================

export interface CreateShipmentInput {
    routeId: string;
    originAddress: Address;
    destinationAddress: Address;
    packageDescription: string;
    declaredWeightKg?: number;
    isFragile?: boolean;
    requiresSignature?: boolean;
}

export interface UpdateShipmentInput {
    packageDescription?: string;
    declaredWeightKg?: number;
    isFragile?: boolean;
    requiresSignature?: boolean;
}

export interface ShipmentFilter {
    customerId?: string;
    routeId?: string;
    status?: ShipmentStatus | ShipmentStatus[];
    createdAfter?: Date;
    createdBefore?: Date;
    trackingCode?: string;
}

export interface CancelShipmentInput {
    shipmentId: string;
    reason: string;
    refundPayment?: boolean;
}

// ==================================================
// OUTPUT TYPES
// ==================================================

export interface ShipmentDTO {
    id: string;
    trackingCode: string;
    status: ShipmentStatus;

    // Customer
    customerId: string;

    // Route
    routeId: string;

    // Addresses
    originAddress: Address;
    destinationAddress: Address;

    // Package
    packageDescription: string;
    declaredWeightKg: number | null;
    isFragile: boolean;
    requiresSignature: boolean;

    // Related entities
    hasQuote: boolean;
    hasScanResult: boolean;
    hasPayment: boolean;

    // Timestamps
    createdAt: Date;
    quotedAt: Date | null;
    confirmedAt: Date | null;
    pickedUpAt: Date | null;
    inTransitAt: Date | null;
    outForDeliveryAt: Date | null;
    deliveredAt: Date | null;
    cancelledAt: Date | null;
    cancellationReason: string | null;
}

export interface ShipmentDetailDTO extends ShipmentDTO {
    quote?: {
        id: string;
        totalPriceXof: number;
        validUntil: Date;
        status: string;
    };
    scanResult?: {
        id: string;
        status: string;
        confidenceScore: number | null;
        requiresManualValidation: boolean;
    };
    payment?: {
        id: string;
        status: string;
        method: string;
        amountXof: number;
    };
}

export interface ShipmentTimelineEvent {
    status: ShipmentStatus;
    timestamp: Date;
    actor?: string;
    notes?: string;
}

// ==================================================
// SERVICE INTERFACE
// ==================================================

export interface IShipmentService {
    /**
     * Create a new shipment in DRAFT state.
     * Generates a unique tracking code.
     * 
     * @throws RouteNotFoundError - Route does not exist
     * @throws InvalidStateError - Route is not ACTIVE
     * @throws ValidationError - Invalid address or package details
     */
    createShipment(
        input: CreateShipmentInput,
        ctx: ServiceContext
    ): Promise<ShipmentDTO>;

    /**
     * Update a shipment's package details.
     * Only allowed in DRAFT or QUOTED state.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws InvalidStateError - Shipment not in DRAFT or QUOTED state
     */
    updateShipment(
        shipmentId: string,
        input: UpdateShipmentInput,
        ctx: ServiceContext
    ): Promise<ShipmentDTO>;

    /**
     * Confirm a shipment after quote acceptance and payment.
     * Transitions from QUOTED to CONFIRMED.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws InvalidStateError - Shipment not in QUOTED state
     * @throws QuoteNotFoundError - No accepted quote
     * @throws InvalidStateError - Payment not completed
     */
    confirmShipment(
        shipmentId: string,
        ctx: ServiceContext
    ): Promise<ShipmentDTO>;

    /**
     * Mark shipment as picked up.
     * Called when driver picks up the package.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws InvalidStateError - Shipment not in CONFIRMED state
     */
    markPickedUp(
        shipmentId: string,
        ctx: ServiceContext
    ): Promise<ShipmentDTO>;

    /**
     * Mark shipment as in transit.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws InvalidStateError - Shipment not in PICKED_UP state
     */
    markInTransit(
        shipmentId: string,
        ctx: ServiceContext
    ): Promise<ShipmentDTO>;

    /**
     * Mark shipment as out for delivery.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws InvalidStateError - Shipment not in IN_TRANSIT state
     */
    markOutForDelivery(
        shipmentId: string,
        ctx: ServiceContext
    ): Promise<ShipmentDTO>;

    /**
     * Mark shipment as delivered.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws InvalidStateError - Shipment not in OUT_FOR_DELIVERY state
     */
    markDelivered(
        shipmentId: string,
        proofOfDelivery?: { signatureHash?: string; photoHash?: string; recipientName?: string },
        ctx?: ServiceContext
    ): Promise<ShipmentDTO>;

    /**
     * Cancel a shipment.
     * Optionally triggers payment refund.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws InvalidStateError - Shipment in terminal state (DELIVERED/CANCELLED)
     */
    cancelShipment(
        input: CancelShipmentInput,
        ctx: ServiceContext
    ): Promise<ShipmentDTO>;

    /**
     * Get a shipment by ID with full details.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     */
    getShipmentById(shipmentId: string): Promise<ShipmentDetailDTO>;

    /**
     * Get a shipment by tracking code.
     * 
     * @throws ShipmentNotFoundError - Shipment not found
     */
    getShipmentByTrackingCode(trackingCode: string): Promise<ShipmentDetailDTO>;

    /**
     * List shipments with filtering and pagination.
     */
    listShipments(
        filter: ShipmentFilter,
        pagination: PaginationParams,
        ctx: ServiceContext
    ): Promise<PaginatedResult<ShipmentDTO>>;

    /**
     * Get the timeline of status changes for a shipment.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     */
    getShipmentTimeline(shipmentId: string): Promise<ShipmentTimelineEvent[]>;

    /**
     * Generate a unique tracking code.
     * Format: TL-{timestamp}-{random}
     */
    generateTrackingCode(): string;
}
