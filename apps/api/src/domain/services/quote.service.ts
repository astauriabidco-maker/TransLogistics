/**
 * QuoteService Interface
 * 
 * Manages quote creation, validation, and lifecycle.
 * Enforces immutability after acceptance.
 */

import type { ServiceContext, Dimensions, QuoteStatus, PriceBreakdown } from './types';

// ==================================================
// INPUT TYPES
// ==================================================

export interface CreateQuoteInput {
    shipmentId: string;
    dimensions: Dimensions;
    weightKg: number;
    validityMinutes?: number;
}

export interface CreateQuoteFromScanInput {
    shipmentId: string;
    scanResultId: string;
    weightKg: number;
    validityMinutes?: number;
}

// ==================================================
// OUTPUT TYPES
// ==================================================

export interface QuoteDTO {
    id: string;
    shipmentId: string;
    status: QuoteStatus;

    // Dimensions used
    dimensions: Dimensions;
    volumeCm3: number;
    weightKg: number;

    // Pricing snapshot
    pricingRuleId: string;
    pricingRuleVersion: number;
    breakdown: PriceBreakdown;

    // Validity
    validUntil: Date;
    acceptedAt: Date | null;
    expiredAt: Date | null;

    createdAt: Date;
}

// ==================================================
// SERVICE INTERFACE
// ==================================================

export interface IQuoteService {
    /**
     * Create a quote for a shipment with manual dimensions.
     * Uses the active pricing rule for the shipment's route.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws InvalidStateError - Shipment already has a quote
     * @throws NoPricingRuleError - No active pricing rule for route
     * @throws ValidationError - Invalid dimensions or weight
     */
    createQuote(
        input: CreateQuoteInput,
        ctx: ServiceContext
    ): Promise<QuoteDTO>;

    /**
     * Create a quote using dimensions from a validated scan result.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws NotFoundError - ScanResult does not exist
     * @throws InvalidStateError - ScanResult not validated or shipment has quote
     * @throws NoPricingRuleError - No active pricing rule for route
     */
    createQuoteFromScan(
        input: CreateQuoteFromScanInput,
        ctx: ServiceContext
    ): Promise<QuoteDTO>;

    /**
     * Accept a pending quote.
     * After acceptance, the quote becomes immutable.
     * 
     * @throws QuoteNotFoundError - Quote does not exist
     * @throws QuoteExpiredError - Quote validity period has passed
     * @throws QuoteAlreadyAcceptedError - Quote was already accepted
     * @throws InvalidStateError - Quote is not in PENDING state
     */
    acceptQuote(
        quoteId: string,
        ctx: ServiceContext
    ): Promise<QuoteDTO>;

    /**
     * Reject a pending quote.
     * 
     * @throws QuoteNotFoundError - Quote does not exist
     * @throws InvalidStateError - Quote is not in PENDING state
     */
    rejectQuote(
        quoteId: string,
        ctx: ServiceContext
    ): Promise<QuoteDTO>;

    /**
     * Get a quote by ID.
     * 
     * @throws QuoteNotFoundError - Quote does not exist
     */
    getQuoteById(quoteId: string): Promise<QuoteDTO>;

    /**
     * Get the quote for a shipment.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @returns null if shipment has no quote yet
     */
    getQuoteByShipmentId(shipmentId: string): Promise<QuoteDTO | null>;

    /**
     * Check and expire quotes past their validity period.
     * Called by scheduled job.
     * 
     * @returns Number of quotes expired
     */
    expireStaleQuotes(ctx: ServiceContext): Promise<number>;

    /**
     * Recalculate a quote with new dimensions (only if PENDING).
     * 
     * @throws QuoteNotFoundError - Quote does not exist
     * @throws InvalidStateError - Quote is not in PENDING state
     */
    recalculateQuote(
        quoteId: string,
        newDimensions: Dimensions,
        newWeightKg: number,
        ctx: ServiceContext
    ): Promise<QuoteDTO>;
}
